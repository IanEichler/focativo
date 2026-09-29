import "server-only";
import { link, mkdir, open, readFile, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { hash } from "./security";

function archivePath(digest: string) {
  const directory = process.env.SIGNING_ARCHIVE_DIR;
  if (!directory || !isAbsolute(directory)) throw new Error("Configure a pasta persistente SIGNING_ARCHIVE_DIR para guardar os contratos assinados.");
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Hash de arquivo inválido.");
  return { directory, file: join(directory, `${digest}.pdf`) };
}

export async function readArchivedPdf(digest: string): Promise<Buffer> {
  const bytes = await readFile(archivePath(digest).file);
  if (hash(bytes) !== digest) throw new Error("Falha na integridade da cópia do contrato.");
  return bytes;
}

// Outside the application releases: deployment cleanup must never remove this directory.
// Publish only a fully flushed file, without replacing an existing copy.
export async function archiveSignedPdf(bytes: Buffer): Promise<void> {
  const digest = hash(bytes);
  const { directory, file } = archivePath(digest);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally { await handle.close(); }
  try {
    try { await link(temporary, file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    await readArchivedPdf(digest);
    if (process.platform !== "win32") {
      const folder = await open(directory, "r");
      try { await folder.sync(); } finally { await folder.close(); }
    }
  } finally { await unlink(temporary); }
}
