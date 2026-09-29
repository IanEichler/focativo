import { expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
vi.mock("server-only", () => ({}));
import { appendSignatureReceipt, type SignatureEvidence } from "./pdf";
import { CONSENT_TEXT, hash } from "./security";

it("preserves original pages and appends the consent receipt without clipping long evidence", async () => {
  const original = await PDFDocument.create();
  original.addPage([595.28, 841.89]).drawText("TESTE - SEM VALIDADE", { x: 50, y: 750, size: 22 });
  const bytes = await original.save();
  const evidence: SignatureEvidence = {
    version: 2, requestId: "00000000-0000-4000-8000-000000000000", documentName: "TESTE - SEM VALIDADE.pdf",
    originalSha256: hash(bytes), signerName: "Pessoa fictícia para teste", signerDocument: "00000000000",
    signerEmail: "", accepted: true, consentVersion: "2026-09-29-v2-link", consentText: CONSENT_TEXT,
    signedAt: "2026-09-29T20:00:00.000Z", viewedAt: "2026-09-29T19:59:00.000Z",
    authentication: "unique_link", ip: null, userAgent: "Navegador de teste", signatureImageSha256: null,
  };
  const signed = await appendSignatureReceipt(bytes, evidence, "b".repeat(64));
  const parsed = await PDFDocument.load(signed);
  expect(parsed.getPageCount()).toBe(2);
  expect(parsed.getPage(0).getSize()).toEqual(original.getPage(0).getSize());
  if (process.env.SIGNATURE_PDF_QA === "true") await writeFile(join(tmpdir(), "signature-test-only.pdf"), signed);
  const long = await appendSignatureReceipt(bytes, { ...evidence, documentName: "Contrato teste ".repeat(200) }, "c".repeat(64));
  expect((await PDFDocument.load(long)).getPageCount()).toBeGreaterThan(2);
});
