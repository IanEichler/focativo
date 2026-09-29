import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
vi.mock("server-only", () => ({}));
import { archiveSignedPdf, readArchivedPdf } from "./archive";
import { hash } from "./security";
const folders: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true });
});
it("stores the exact PDF and handles concurrent writes without replacing it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "signature-archive-")); folders.push(directory);
  vi.stubEnv("SIGNING_ARCHIVE_DIR", directory);
  const bytes = Buffer.from("signed PDF fixture");
  await Promise.all([archiveSignedPdf(bytes), archiveSignedPdf(bytes)]);
  expect(await readArchivedPdf(hash(bytes))).toEqual(bytes);
  await writeFile(join(directory, `${hash(bytes)}.pdf`), "tampered");
  await expect(archiveSignedPdf(bytes)).rejects.toThrow("integridade");
  expect((await readFile(join(directory, `${hash(bytes)}.pdf`))).toString()).toBe("tampered");
  await expect(readArchivedPdf("../escape")).rejects.toThrow("Hash");
});
it("requires a persistent absolute directory before saving", async () => {
  vi.stubEnv("SIGNING_ARCHIVE_DIR", "relative");
  await expect(archiveSignedPdf(Buffer.from("pdf"))).rejects.toThrow("SIGNING_ARCHIVE_DIR");
});
