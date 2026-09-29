import "server-only";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { signingClient, type SignatureRow } from "./client";
import { appendSignatureReceipt, type SignatureEvidence } from "./pdf";
import { codeHash, CONSENT_TEXT, CONSENT_VERSION, hash, newCode, newToken, safeEqual, sealEvidence, SIGNATURE_BUCKET, TOKEN_PATTERN } from "./security";
import { sendSignatureCode } from "./mail";
import type { Json } from "@/types/database.types";

export class SigningError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
const dbError = (result: { data: unknown; error: unknown }) => {
  if (result.error) throw new SigningError("internal", 500);
  const data = result.data as { error?: string } | null;
  if (data?.error) throw new SigningError(data.error, ["rate_limit", "locked"].includes(data.error) ? 429 : 400);
};
export async function getSignature(token: string): Promise<SignatureRow> {
  if (!TOKEN_PATTERN.test(token)) throw new SigningError("unavailable", 404);
  const { data, error } = await signingClient().from("contract_signatures").select("*").eq("token_hash", hash(token)).maybeSingle();
  if (error) throw new SigningError("internal", 500);
  if (!data || data.status === "DRAFT" || data.status === "REVOKED" || !data.expires_at || Date.parse(data.expires_at) <= Date.now()) throw new SigningError("unavailable", 404);
  return data;
}
export function isVerified(row: SignatureRow, session?: string) {
  return Boolean(session && TOKEN_PATTERN.test(session) && row.session_hash && row.session_expires_at &&
    Date.parse(row.session_expires_at) > Date.now() && safeEqual(row.session_hash, hash(session)));
}
export async function requestSignatureCode(token: string) {
  const row = await getSignature(token);
  const code = newCode();
  const client = signingClient();
  const issued = await client.rpc("signature_issue_code", { p_token_hash: hash(token), p_otp_hash: codeHash(token, code) });
  dbError(issued);
  try {
    await sendSignatureCode(row.signer_email, code, row.id, randomUUID());
    const logged = await client.from("contract_signature_events").insert({ signature_id: row.id, event: "CODE_SENT" });
    if (logged.error) throw new Error("audit_failed");
  } catch {
    await client.from("contract_signature_events").insert({ signature_id: row.id, event: "CODE_DELIVERY_FAILED" });
    throw new SigningError("delivery_failed", 503);
  }
}
export async function verifySignatureCode(token: string, code: string) {
  const session = newToken();
  dbError(await signingClient().rpc("signature_verify_code", { p_token_hash: hash(token), p_otp_hash: codeHash(token, code), p_session_hash: hash(session) }));
  return session;
}
export async function signaturePdf(row: SignatureRow, session: string | undefined, signed: boolean) {
  if (!isVerified(row, session)) throw new SigningError("verification_required", 401);
  const path = signed ? row.signed_path : row.original_path;
  if (!path) throw new SigningError("unavailable", 404);
  if (signed && (!row.evidence || !row.evidence_seal || !safeEqual(sealEvidence(row.evidence), row.evidence_seal))) throw new SigningError("integrity_error", 409);
  const client = signingClient();
  const { data, error } = await client.storage.from(SIGNATURE_BUCKET).download(path);
  if (error || !data) throw new SigningError("internal", 500);
  const bytes = Buffer.from(await data.arrayBuffer());
  if (hash(bytes) !== (signed ? row.signed_sha256 : row.original_sha256)) throw new SigningError("integrity_error", 409);
  if (!signed && row.status === "PENDING" && !row.viewed_at) {
    const updated = await client.from("contract_signatures").update({ viewed_at: new Date().toISOString() })
      .eq("id", row.id).eq("status", "PENDING").eq("session_hash", hash(session!));
    if (updated.error) throw new SigningError("internal", 500);
  }
  return bytes;
}
export async function signContract(token: string, session: string | undefined, input: { name: string; consentVersion: string; accepted: boolean; signature?: string }, headers: Headers) {
  const row = await getSignature(token);
  if (!isVerified(row, session) || !row.viewed_at || !row.verified_at) throw new SigningError("verification_required", 401);
  if (row.status !== "PENDING") throw new SigningError("unavailable", 409);
  const normalize = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  if (!input.accepted || input.consentVersion !== CONSENT_VERSION || normalize(input.name) !== normalize(row.signer_name)) throw new SigningError("consent_required");
  const drawing = input.signature ? Buffer.from(input.signature.replace(/^data:image\/png;base64,/, ""), "base64") : undefined;
  if (drawing && (drawing.length < 24 || drawing.length > 120000 || drawing.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    drawing.toString("ascii", 12, 16) !== "IHDR" || drawing.readUInt32BE(16) > 2048 || drawing.readUInt32BE(20) > 2048)) throw new SigningError("invalid_signature");
  const ipHeader = process.env.SIGNING_TRUST_PROXY === "true" ? headers.get("x-forwarded-for")?.split(",")[0]?.trim() : null;
  const evidence: SignatureEvidence = {
    version: 1, requestId: row.id, documentName: row.document_name, originalSha256: row.original_sha256,
    signerName: row.signer_name, signerDocument: row.signer_document, signerEmail: row.signer_email,
    accepted: true, consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT,
    signedAt: new Date().toISOString(), verifiedAt: row.verified_at, viewedAt: row.viewed_at,
    authentication: "email_otp", ip: ipHeader && isIP(ipHeader) ? ipHeader : null,
    userAgent: (headers.get("user-agent") ?? "").slice(0, 500), signatureImageSha256: drawing ? hash(drawing) : null,
  };
  const seal = sealEvidence(evidence);
  const original = await signaturePdf(row, session, false);
  const signed = await appendSignatureReceipt(original, evidence, seal, drawing);
  const path = `${row.tenant_id}/${row.id}/${randomUUID()}-assinado.pdf`;
  const client = signingClient();
  const upload = await client.storage.from(SIGNATURE_BUCKET).upload(path, signed, { contentType: "application/pdf", upsert: false });
  if (upload.error) throw new SigningError("internal", 500);
  const result = await client.rpc("signature_complete", {
    p_token_hash: hash(token), p_session_hash: hash(session!), p_signed_path: path,
    p_signed_sha256: hash(signed), p_evidence: evidence as unknown as Json, p_seal: seal,
  });
  if (result.error) {
    // A transport failure can hide a committed signature. Never delete its PDF.
    const current = await client.from("contract_signatures").select("status,signed_path").eq("id", row.id).maybeSingle();
    if (current.data?.status === "SIGNED" && current.data.signed_path === path) return;
    throw new SigningError("internal", 500);
  }
  try { dbError(result); }
  catch (error) { await client.storage.from(SIGNATURE_BUCKET).remove([path]); throw error; }
}
