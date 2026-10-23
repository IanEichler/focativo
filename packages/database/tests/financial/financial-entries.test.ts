import { beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { useTestDatabase } from "../../src/harness/test-db";

const db = useTestDatabase();
let tenantId: string, ownerId: string, customerId: string;

beforeAll(async () => {
  ({ tenantId, ownerId } = await db.createTenantWithOwner("Financial entries"));
  const [customer] = await db.admin.query<{ id: string }>(
    "insert into public.customers(tenant_id,name,email) values($1,'Cliente financeiro','financeiro@example.test') returning id",
    [tenantId],
  );
  customerId = customer!.id;
});

type Entry = { id: string; amount: string; due_date: string; installment_number: number; installment_count: number; status: string; paid_at: string | null; payment_method: string | null };

async function entriesFor(filter: string, values: unknown[]) {
  return db.admin.query<Entry>(
    `select id, amount::text, to_char(due_date,'YYYY-MM-DD') as due_date, installment_number, installment_count, status,
       to_char(paid_at,'YYYY-MM-DD') as paid_at, payment_method
     from public.financial_entries where ${filter} order by installment_number`,
    values,
  );
}

const plan = (items: { amount: string; dueDate: string }[], description = "Pacote facial") =>
  items.map((item, index) => ({ number: index + 1, count: items.length, description, paymentMethod: "Pix", ...item }));

async function request(paymentPlan: unknown[]) {
  const [document] = await db.as(ownerId).rpc<{ customer_document_create: string }>("customer_document_create", {
    p_customer_id: customerId, p_template_id: null, p_name: "Contrato.docx", p_file_path: `${tenantId}/${randomUUID()}.docx`,
  });
  const token = randomUUID();
  const [row] = await db.service.query<{ id: string }>(
    `insert into public.contract_signatures(tenant_id,customer_id,document_id,created_by,document_name,signer_name,original_path,original_sha256,status,token_hash,expires_at,viewed_at,payment_plan)
     values($1,$2,$3,$4,'Contrato.pdf','Cliente financeiro','original.pdf',$5,'PENDING',$6,now()+interval '7 days',now(),$7::jsonb) returning id`,
    [tenantId, customerId, document!.customer_document_create, ownerId, "a".repeat(64), token, JSON.stringify(paymentPlan)],
  );
  return { id: row!.id, token };
}

async function sign(r: { id: string; token: string }) {
  const [result] = await db.service.rpc("signature_complete_link", {
    p_token_hash: r.token, p_signed_path: `${tenantId}/${r.id}/signed.pdf`, p_signed_sha256: "b".repeat(64), p_seal: "c".repeat(64),
    p_evidence: JSON.stringify({ requestId: r.id, originalSha256: "a".repeat(64), signerName: "Cliente financeiro", accepted: true, authentication: "unique_link", consentVersion: "2026-09-29-v3-location" }),
  });
  return result!.signature_complete_link;
}

it("creates the contract installments only when it is signed, once, and keeps the plan frozen", async () => {
  const r = await request(plan([{ amount: "500.00", dueDate: "2100-01-10" }, { amount: "500.00", dueDate: "2100-02-10" }]));
  expect(await entriesFor("signature_id=$1", [r.id])).toHaveLength(0);
  await expect(db.service.query("update public.contract_signatures set payment_plan='[]' where id=$1", [r.id])).rejects.toThrow("signature_snapshot_immutable");

  expect(await Promise.all([sign(r), sign(r)])).toContainEqual({ ok: true });
  const rows = await entriesFor("signature_id=$1", [r.id]);
  expect(rows).toEqual([
    expect.objectContaining({ amount: "500.00", due_date: "2100-01-10", installment_number: 1, installment_count: 2, status: "PENDING", payment_method: "Pix" }),
    expect.objectContaining({ amount: "500.00", due_date: "2100-02-10", installment_number: 2, installment_count: 2, status: "PENDING" }),
  ]);
});

it("rejects malformed payment plans before the contract goes out for signature", async () => {
  await expect(request(plan([{ amount: "0", dueDate: "2100-01-10" }]))).rejects.toThrow("invalid_payment_plan");
  await expect(request(plan([{ amount: "10.00", dueDate: "10/01/2100" }]))).rejects.toThrow("invalid_payment_plan");
  await expect(request([{ number: 2, count: 1, amount: "10.00", dueDate: "2100-01-10", description: "Pacote" }])).rejects.toThrow("invalid_payment_plan");
  const empty = await request([]);
  expect(await sign(empty)).toEqual({ ok: true });
  expect(await entriesFor("signature_id=$1", [empty.id])).toHaveLength(0);
});

it("splits a manual total into monthly installments with the leftover cents on the first", async () => {
  const [created] = await db.as(ownerId).rpc<{ financial_entry_create: number }>("financial_entry_create", {
    p_tenant_id: tenantId, p_customer_id: customerId, p_description: "Sessões avulsas", p_total: 100,
    p_first_due_date: "2100-01-31", p_installments: 3, p_payment_method: "Cartão de crédito",
  });
  expect(created!.financial_entry_create).toBe(3);
  const rows = await entriesFor("customer_id=$1 and description='Sessões avulsas'", [customerId]);
  expect(rows.map((row) => [row.amount, row.due_date])).toEqual([
    ["33.34", "2100-01-31"], ["33.33", "2100-02-28"], ["33.33", "2100-03-31"],
  ]);
});

it("pays, reverses and cancels only from the allowed states", async () => {
  await db.as(ownerId).rpc("financial_entry_create", {
    p_tenant_id: tenantId, p_customer_id: customerId, p_description: "Limpeza de pele", p_total: 250, p_first_due_date: "2100-05-01",
  });
  const [entry] = await entriesFor("description='Limpeza de pele'", []);

  await db.as(ownerId).rpc("financial_entry_update", { p_entry_id: entry!.id, p_description: "Limpeza de pele", p_amount: 230, p_due_date: "2100-05-05" });
  await db.as(ownerId).rpc("financial_entry_pay", { p_entry_id: entry!.id, p_paid_at: "2026-10-20", p_payment_method: "Dinheiro" });
  let [row] = await entriesFor("id=$1", [entry!.id]);
  expect(row).toMatchObject({ amount: "230.00", due_date: "2100-05-05", status: "PAID", paid_at: "2026-10-20", payment_method: "Dinheiro" });

  await expect(db.as(ownerId).rpc("financial_entry_pay", { p_entry_id: entry!.id, p_paid_at: "2026-10-20" })).rejects.toThrow("entry_not_pending");
  await expect(db.as(ownerId).rpc("financial_entry_cancel", { p_entry_id: entry!.id })).rejects.toThrow("entry_not_pending");
  await expect(db.as(ownerId).rpc("financial_entry_update", { p_entry_id: entry!.id, p_description: "X pacote", p_amount: 1, p_due_date: "2100-05-05" })).rejects.toThrow("entry_not_pending");

  await db.as(ownerId).rpc("financial_entry_unpay", { p_entry_id: entry!.id });
  [row] = await entriesFor("id=$1", [entry!.id]);
  expect(row).toMatchObject({ status: "PENDING", paid_at: null });

  await db.as(ownerId).rpc("financial_entry_cancel", { p_entry_id: entry!.id, p_reason: "Cliente desistiu" });
  [row] = await entriesFor("id=$1", [entry!.id]);
  expect(row!.status).toBe("CANCELED");
  await expect(db.as(ownerId).rpc("financial_entry_unpay", { p_entry_id: entry!.id })).rejects.toThrow("entry_not_paid");

  const events = await db.admin.query<{ type: string }>(
    "select type from public.timeline_events where customer_id=$1 and type like 'financial.%' order by occurred_at", [customerId],
  );
  expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["financial.entry_paid", "financial.entry_payment_reversed", "financial.entry_canceled"]));
});

it("validates input and isolates entries by tenant and permission", async () => {
  await expect(db.as(ownerId).rpc("financial_entry_create", {
    p_tenant_id: tenantId, p_customer_id: customerId, p_description: "Inválido", p_total: 0.01, p_first_due_date: "2100-01-01", p_installments: 2,
  })).rejects.toThrow("invalid_input");
  await expect(db.as(ownerId).rpc("financial_entry_create", {
    p_tenant_id: tenantId, p_customer_id: customerId, p_description: "Inválido", p_total: 10.001, p_first_due_date: "2100-01-01",
  })).rejects.toThrow("invalid_input");

  const outsider = await db.createUser({ email: "financial-outsider@example.test" });
  expect(await db.as(outsider).query("select id from public.financial_entries")).toHaveLength(0);
  await expect(db.as(outsider).rpc("financial_entry_create", {
    p_tenant_id: tenantId, p_customer_id: customerId, p_description: "Intruso", p_total: 10, p_first_due_date: "2100-01-01",
  })).rejects.toThrow("forbidden");
  const [entry] = await entriesFor("tenant_id=$1 and status='PENDING'", [tenantId]);
  await expect(db.as(outsider).rpc("financial_entry_pay", { p_entry_id: entry!.id, p_paid_at: "2026-10-20" })).rejects.toThrow("forbidden");
  await expect(db.anon.query("select id from public.financial_entries")).rejects.toThrow("permission denied");
  await expect(db.as(ownerId).query("delete from public.financial_entries where id=$1", [entry!.id])).rejects.toThrow("permission denied");
  await expect(db.as(ownerId).query("update public.financial_entries set amount=1 where id=$1", [entry!.id])).rejects.toThrow("permission denied");
  expect((await db.as(ownerId).query("select id from public.financial_entries")).length).toBeGreaterThan(0);
});
