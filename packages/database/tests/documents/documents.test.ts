import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useTestDatabase } from "../../src/harness/test-db";

describe("documentos: modelos e documentos gerados por cliente", () => {
  const db = useTestDatabase();
  let tenantId: string;
  let ownerId: string;
  let sellerId: string;
  let customerId: string;

  beforeAll(async () => {
    const owner = await db.createTenantWithOwner("Clínica Teste");
    tenantId = owner.tenantId;
    ownerId = owner.ownerId;
    sellerId = await db.addActiveMember(tenantId, "VENDEDOR");

    const [customer] = await db
      .as(ownerId)
      .query<{ id: string }>("insert into public.customers (tenant_id, name, phone) values ($1, $2, $3) returning id", [
        tenantId,
        "Cliente Documento",
        "11955554444",
      ]);
    customerId = customer!.id;
  });

  it("creates a document template and reads back the discovered fields", async () => {
    const [row] = await db.as(ownerId).rpc<{ document_template_create: string }>("document_template_create", {
      p_tenant_id: tenantId,
      p_name: "Contrato Padrão",
      p_file_path: `${tenantId}/${randomUUID()}.docx`,
      p_fields: JSON.stringify(["nome", "cpf", "valor"]),
    });
    const templateId = row!.document_template_create;
    expect(templateId).toBeTruthy();

    const [template] = await db
      .as(ownerId)
      .query<{ name: string; fields: string[]; is_active: boolean }>(
        "select name, fields, is_active from public.document_templates where id = $1",
        [templateId],
      );
    expect(template).toMatchObject({ name: "Contrato Padrão", is_active: true });
    expect(template!.fields).toEqual(["nome", "cpf", "valor"]);
  });

  it("rejects creating a template from someone without documents.write", async () => {
    const outsider = await db.createUser({ email: "sem-permissao-documento@example.com" });
    await expectDbError(
      db.as(outsider).rpc("document_template_create", {
        p_tenant_id: tenantId,
        p_name: "Modelo Alheio",
        p_file_path: `${tenantId}/${randomUUID()}.docx`,
      }),
      "forbidden",
    );
  });

  it("archives a template (is_active = false) without deleting the row", async () => {
    const [row] = await db.as(sellerId).rpc<{ document_template_create: string }>("document_template_create", {
      p_tenant_id: tenantId,
      p_name: "Modelo Pra Arquivar",
      p_file_path: `${tenantId}/${randomUUID()}.docx`,
    });
    const templateId = row!.document_template_create;

    await db.as(sellerId).rpc("document_template_archive", { p_template_id: templateId });

    const [template] = await db.admin.query<{ is_active: boolean }>(
      "select is_active from public.document_templates where id = $1",
      [templateId],
    );
    expect(template!.is_active).toBe(false);
  });

  it("creates a customer document and logs a timeline event", async () => {
    const [templateRow] = await db.as(ownerId).rpc<{ document_template_create: string }>("document_template_create", {
      p_tenant_id: tenantId,
      p_name: "Contrato Geração",
      p_file_path: `${tenantId}/${randomUUID()}.docx`,
    });
    const templateId = templateRow!.document_template_create;

    const [docRow] = await db.as(sellerId).rpc<{ customer_document_create: string }>("customer_document_create", {
      p_customer_id: customerId,
      p_template_id: templateId,
      p_name: "Contrato Geração.docx",
      p_file_path: `${tenantId}/${customerId}/${randomUUID()}.docx`,
    });
    const documentId = docRow!.customer_document_create;
    expect(documentId).toBeTruthy();

    const [event] = await db.admin.query<{ type: string }>(
      `select type from public.timeline_events
       where customer_id = $1 and type = 'customer.document_generated'
       order by occurred_at desc limit 1`,
      [customerId],
    );
    expect(event).toBeTruthy();
  });

  it("rejects creating a customer document from someone without documents.write", async () => {
    const outsider = await db.createUser({ email: "sem-permissao-documento-cliente@example.com" });
    await expectDbError(
      db.as(outsider).rpc("customer_document_create", {
        p_customer_id: customerId,
        p_template_id: null,
        p_name: "Indevido.docx",
        p_file_path: `${tenantId}/x.docx`,
      }),
      "forbidden",
    );
  });

  it("keeps the customer document when its template is deleted (template_id becomes null)", async () => {
    const [templateRow] = await db.as(ownerId).rpc<{ document_template_create: string }>("document_template_create", {
      p_tenant_id: tenantId,
      p_name: "Modelo Descartável",
      p_file_path: `${tenantId}/${randomUUID()}.docx`,
    });
    const templateId = templateRow!.document_template_create;

    const [docRow] = await db.as(ownerId).rpc<{ customer_document_create: string }>("customer_document_create", {
      p_customer_id: customerId,
      p_template_id: templateId,
      p_name: "Documento Órfão.docx",
      p_file_path: `${tenantId}/${customerId}/${randomUUID()}.docx`,
    });
    const documentId = docRow!.customer_document_create;

    await db.admin.query("delete from public.document_templates where id = $1", [templateId]);

    const [document] = await db.admin.query<{ template_id: string | null }>(
      "select template_id from public.customer_documents where id = $1",
      [documentId],
    );
    expect(document).toBeTruthy();
    expect(document!.template_id).toBeNull();
  });

  it("removes customer documents when the customer is truly purged (cascade)", async () => {
    const [customer] = await db
      .as(ownerId)
      .query<{ id: string }>("insert into public.customers (tenant_id, name, phone) values ($1, $2, $3) returning id", [
        tenantId,
        "Cliente Pra Purgar",
        "11944443333",
      ]);
    const purgeCustomerId = customer!.id;

    const [docRow] = await db.as(ownerId).rpc<{ customer_document_create: string }>("customer_document_create", {
      p_customer_id: purgeCustomerId,
      p_template_id: null,
      p_name: "Documento Do Cliente Purgado.docx",
      p_file_path: `${tenantId}/${purgeCustomerId}/${randomUUID()}.docx`,
    });
    const documentId = docRow!.customer_document_create;

    await db.as(ownerId).rpc("customer_purge", { p_customer_id: purgeCustomerId });

    const documents = await db.admin.query("select id from public.customer_documents where id = $1", [documentId]);
    expect(documents).toHaveLength(0);
  });
});
