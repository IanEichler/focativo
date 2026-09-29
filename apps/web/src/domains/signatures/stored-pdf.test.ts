import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ download: vi.fn(), archive: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ signingClient: () => ({ storage: { from: () => ({ download: mock.download }) } }) }));
vi.mock("./archive", () => ({ readArchivedPdf: mock.archive }));
import { hash, sealEvidence } from "./security";
import { readSignedPdf } from "./stored-pdf";
const bytes = Buffer.from("immutable signed PDF");
function row() {
  const evidence = { accepted: true };
  return { signed_path: "signed.pdf", signed_sha256: hash(bytes), evidence, evidence_seal: sealEvidence(evidence) };
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("SIGNING_SECRET", "a".repeat(64)); });
afterEach(() => vi.unstubAllEnvs());
it("downloads the stored bytes without requiring an active signing link", async () => {
  mock.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
  expect(await readSignedPdf(row())).toEqual(bytes);
  expect(mock.archive).not.toHaveBeenCalled();
});
it.each(["missing", "tampered", "offline"])("recovers from the verified archive when primary storage is %s", async failure => {
  if (failure === "offline") mock.download.mockRejectedValue(new Error("network"));
  else mock.download.mockResolvedValue({ data: failure === "tampered" ? new Blob(["modified"]) : null, error: failure === "missing" ? {} : null });
  mock.archive.mockResolvedValue(bytes);
  expect(await readSignedPdf(row())).toEqual(bytes);
  expect(mock.archive).toHaveBeenCalledWith(hash(bytes));
});
it("rejects altered evidence and never fabricates a replacement PDF", async () => {
  await expect(readSignedPdf({ ...row(), evidence: { accepted: false } })).rejects.toThrow("evidências");
  expect(mock.download).not.toHaveBeenCalled();
  mock.download.mockResolvedValue({ error: {}, data: null }); mock.archive.mockRejectedValue(new Error("missing"));
  await expect(readSignedPdf(row())).rejects.toThrow("cópia íntegra");
});
