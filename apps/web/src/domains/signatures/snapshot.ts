import "server-only";
import { randomUUID } from "node:crypto";
import type { TenantContext } from "@/domains/tenants/context";
import { signingClient } from "./client";
import { hash, SIGNATURE_BUCKET } from "./security";
import { normalizeFieldName } from "@/domains/documents/field-format";

/** Called after the authenticated document-create RPC. Keep the exact reviewed PDF and party data. */
export async function saveSigningSnapshot(context: TenantContext, documentId: string, customerId: string, name: string,
  pdf: Buffer, fields: Record<string, string>, customer: { name: string; email: string | null; document: string | null }) {
  if (!context.can("documents.write") || !context.hasModule("documents")) throw new Error("forbidden");
  const pick = (aliases: string[], fallback: string | null) => {
    const entry = Object.entries(fields).find(([field]) => aliases.includes(normalizeFieldName(field)));
    return (entry ? entry[1] : fallback ?? "").trim();
  };
  const id = randomUUID();
  const path = `${context.tenant.id}/${id}/original.pdf`;
  const client = signingClient();
  const uploaded = await client.storage.from(SIGNATURE_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (uploaded.error) throw new Error("signature_snapshot_upload_failed");
  const { error } = await client.from("contract_signatures").insert({
    id, document_id: documentId, tenant_id: context.tenant.id, customer_id: customerId, created_by: context.user.id,
    document_name: name.replace(/\.docx$/i, ".pdf"),
    signer_name: pick(["cliente_nome", "nome_cliente", "nome", "cliente"], customer.name),
    signer_email: pick(["cliente_email", "email", "e_mail"], customer.email).toLowerCase(),
    signer_document: pick(["cliente_cpf", "cpf", "cnpj", "documento", "cpf_cnpj"], customer.document).replace(/\D/g, ""),
    original_path: path, original_sha256: hash(pdf),
  });
  if (error) {
    // An insert timeout can hide a committed snapshot. Preserve the uploaded original.
    throw new Error("signature_snapshot_failed");
  }
}
