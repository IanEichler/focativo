"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";
import { signingClient } from "./client";
import { decryptToken, encryptToken, hash, newToken, publicSigningOrigin, safeEqual, sealEvidence, SIGNATURE_BUCKET, signingReadiness } from "./security";

async function authorized(documentId: string, write = false) {
  const context = await requireTenantContext();
  if (!z.uuid().safeParse(documentId).success || !context.hasModule("documents") || !context.can(write ? "documents.write" : "documents.read")) throw new Error("Sem permissão.");
  const userClient = await createClient();
  const { data, error } = await userClient.from("customer_documents").select("id, customer_id")
    .eq("id", documentId).eq("tenant_id", context.tenant.id).maybeSingle();
  if (error || !data) throw new Error("Contrato não encontrado ou sem acesso.");
  return { context, document: data };
}

export async function signatureStatusAction(documentId: string) {
  try {
    const { context } = await authorized(documentId);
    const { data, error } = await signingClient().from("contract_signatures")
      .select("id,status,expires_at,signed_at,signer_name,signer_email,signer_document")
      .eq("document_id", documentId).eq("tenant_id", context.tenant.id).maybeSingle();
    if (error) throw new Error("Não foi possível consultar a assinatura.");
    return { status: "success" as const, signature: data, expired: Boolean(data?.status === "PENDING" && data.expires_at && Date.parse(data.expires_at) <= Date.now()), configurationMessage: signingReadiness() };
  } catch (error) { return { status: "error" as const, message: error instanceof Error ? error.message : "Falha ao consultar assinatura." }; }
}

export async function createSignatureLinkAction(documentId: string) {
  try {
    const { context } = await authorized(documentId, true);
    const readiness = signingReadiness();
    if (readiness) throw new Error(readiness);
    const client = signingClient();
    const { data: row, error } = await client.from("contract_signatures").select("*").eq("document_id", documentId).eq("tenant_id", context.tenant.id).maybeSingle();
    if (error || !row) throw new Error("Gere um novo contrato para preparar o PDF e os dados para assinatura.");
    if (row.status === "SIGNED") throw new Error("Este contrato já foi assinado.");
    if (row.signer_name.trim().length < 2 || !/^(\d{11}|\d{14})$/.test(row.signer_document)) {
      throw new Error("Preencha nome e CPF/CNPJ da cliente no contrato e gere uma nova versão antes de solicitar a assinatura.");
    }
    if (row.status === "PENDING" && row.expires_at && Date.parse(row.expires_at) > Date.now() && row.token_cipher) {
      return { status: "success" as const, url: `${publicSigningOrigin()}/assinar/${decryptToken(row.token_cipher)}`, expiresAt: row.expires_at };
    }
    const token = newToken();
    const expires = new Date(Date.now() + 7 * 86400000).toISOString();
    let update = client.from("contract_signatures").update({ status: "PENDING", token_hash: hash(token), token_cipher: encryptToken(token), expires_at: expires,
      otp_hash: null, otp_sends: 0, otp_attempts: 0, total_attempts: 0, otp_sent_at: null, session_hash: null, session_expires_at: null, verified_at: null, viewed_at: null })
      .eq("id", row.id).eq("status", row.status);
    update = row.token_hash ? update.eq("token_hash", row.token_hash) : update.is("token_hash", null);
    const updated = await update.select("id").maybeSingle();
    if (updated.error || !updated.data) throw new Error("A solicitação mudou. Atualize a tela e tente novamente.");
    revalidatePath(`/app/clientes/${row.customer_id}`);
    return { status: "success" as const, url: `${publicSigningOrigin()}/assinar/${token}`, expiresAt: expires };
  } catch (error) { return { status: "error" as const, message: error instanceof Error ? error.message : "Não foi possível gerar o link." }; }
}

export async function revokeSignatureAction(documentId: string) {
  try {
    const { context, document } = await authorized(documentId, true);
    const { data, error } = await signingClient().from("contract_signatures").update({ status: "REVOKED", otp_hash: null, session_hash: null })
      .eq("document_id", documentId).eq("tenant_id", context.tenant.id).eq("status", "PENDING").select("id").maybeSingle();
    if (error || !data) throw new Error("Não foi possível cancelar. Atualize o status da assinatura.");
    revalidatePath(`/app/clientes/${document.customer_id}`);
    return { status: "success" as const, message: "Link de assinatura cancelado." };
  } catch (error) { return { status: "error" as const, message: error instanceof Error ? error.message : "Falha ao cancelar." }; }
}

export async function downloadSignedContractAction(documentId: string) {
  try {
    const { context } = await authorized(documentId);
    const client = signingClient();
    const { data: row } = await client.from("contract_signatures").select("signed_path,signed_sha256,document_name,evidence,evidence_seal")
      .eq("document_id", documentId).eq("tenant_id", context.tenant.id).eq("status", "SIGNED").maybeSingle();
    if (!row?.signed_path) throw new Error("Contrato assinado não encontrado.");
    if (!row.evidence || !row.evidence_seal || !safeEqual(sealEvidence(row.evidence), row.evidence_seal)) throw new Error("Falha na verificação das evidências. Contate o suporte.");
    const { data, error } = await client.storage.from(SIGNATURE_BUCKET).download(row.signed_path);
    if (error || !data) throw new Error("Não foi possível baixar o PDF.");
    const bytes = Buffer.from(await data.arrayBuffer());
    if (hash(bytes) !== row.signed_sha256) throw new Error("Falha na verificação de integridade do PDF. Contate o suporte.");
    return { status: "success" as const, base64: bytes.toString("base64"), name: row.document_name.replace(/\.pdf$/i, "-assinado.pdf") };
  } catch (error) { return { status: "error" as const, message: error instanceof Error ? error.message : "Falha no download." }; }
}
