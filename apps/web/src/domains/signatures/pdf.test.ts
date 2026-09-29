import { expect, it, vi } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
vi.mock("server-only", () => ({}));
import { appendSignatureReceipt, type SignatureEvidence } from "./pdf";
import { CONSENT_TEXT, CONSENT_VERSION, hash } from "./security";

const evidence: SignatureEvidence = {
    version: 3, requestId: "00000000-0000-4000-8000-000000000000", documentName: "TESTE - SEM VALIDADE.pdf",
    originalSha256: "a".repeat(64), signerName: "Pessoa fictícia para teste", signerDocument: "00000000000",
    signerEmail: "", accepted: true, consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT,
    signedAt: "2026-09-29T20:00:00.000Z", viewedAt: "2026-09-29T19:59:00.000Z",
    authentication: "unique_link", ip: "203.0.113.7", userAgent: "Navegador de teste", signatureImageSha256: null,
    location: { status: "captured", source: "browser_geolocation", latitude: -15.6, longitude: -56.1, accuracyMeters: 30, capturedAt: "2026-09-29T19:59:55.000Z" },
};

it("preserves original pages and appends the consent receipt without clipping long evidence", async () => {
  const original = await PDFDocument.create();
  original.addPage([595.28, 841.89]).drawText("TESTE - SEM VALIDADE", { x: 50, y: 750, size: 22 });
  const bytes = await original.save();
  const signed = await appendSignatureReceipt(bytes, { ...evidence, originalSha256: hash(bytes) }, "b".repeat(64));
  const parsed = await PDFDocument.load(signed);
  expect(parsed.getPageCount()).toBe(2);
  expect(parsed.getPage(0).getSize()).toEqual(original.getPage(0).getSize());
  if (process.env.SIGNATURE_PDF_QA === "true") await writeFile(join(tmpdir(), "signature-test-only.pdf"), signed);
  const long = await appendSignatureReceipt(bytes, { ...evidence, documentName: "Contrato teste ".repeat(200) }, "c".repeat(64));
  expect((await PDFDocument.load(long)).getPageCount()).toBeGreaterThan(2);
});

it("reserves footer space on portrait, landscape and rotated cropped pages without changing the source bytes", async () => {
  const original = await PDFDocument.create();
  for (const [width, height] of [[595.28, 841.89], [841.89, 595.28]]) {
    const page = original.addPage([width, height]);
    page.drawText("TESTE - SEM VALIDADE", { x: 40, y: height - 50, size: 20 });
    page.drawText("CONTEUDO NO LIMITE INFERIOR - NAO COBRIR", { x: 20, y: 5, size: 10 });
  }
  const rotated = original.addPage([650, 900]);
  rotated.setCropBox(20, 30, 595.28, 841.89);
  rotated.setRotation(degrees(90));
  rotated.drawText("TESTE GIRADO - SEM VALIDADE", { x: 80, y: 700, size: 20 });
  const bytes = await original.save();
  const before = hash(bytes);
  const signed = await appendSignatureReceipt(bytes, {
    ...evidence, originalSha256: before, signerName: "Nome fictício muito longo ".repeat(8),
    documentName: "TESTE - SEM VALIDADE ".repeat(100),
  }, "b".repeat(64));
  const parsed = await PDFDocument.load(signed);
  expect(hash(bytes)).toBe(before);
  expect(parsed.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
  expect(parsed.getPage(1).getSize()).toEqual({ width: 841.89, height: 595.28 });
  expect(parsed.getPage(2).getSize()).toEqual({ width: 841.89, height: 595.28 });
  expect(parsed.getPageCount()).toBeGreaterThan(4);
  if (process.env.SIGNATURE_PDF_QA === "true") await writeFile(join(tmpdir(), "signature-footer-layout-test.pdf"), signed);
});
