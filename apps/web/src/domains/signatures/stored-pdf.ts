import "server-only";
import { signingClient, type SignatureRow } from "./client";
import { readArchivedPdf } from "./archive";
import { hash, safeEqual, sealEvidence, SIGNATURE_BUCKET } from "./security";

type StoredSignature = Pick<SignatureRow, "signed_path" | "signed_sha256" | "evidence" | "evidence_seal">;

export async function readSignedPdf(row: StoredSignature): Promise<Buffer> {
  if (!row.signed_path || !row.signed_sha256 || !row.evidence || !row.evidence_seal ||
    !safeEqual(sealEvidence(row.evidence), row.evidence_seal)) throw new Error("Falha na verificação das evidências do contrato.");
  try {
    const { data, error } = await signingClient().storage.from(SIGNATURE_BUCKET).download(row.signed_path);
    if (!error && data) {
      const bytes = Buffer.from(await data.arrayBuffer());
      if (hash(bytes) === row.signed_sha256) return bytes;
    }
  } catch { /* An independent archive remains available during storage outages. */ }
  try { return await readArchivedPdf(row.signed_sha256); }
  catch { throw new Error("Não foi possível recuperar uma cópia íntegra do PDF assinado. Contate o suporte."); }
}
