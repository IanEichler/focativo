// Run as the app user with the production environment loaded. Outputs counts only.
import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, open, link, unlink, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
async function main() {
  const directory = process.env.SIGNING_ARCHIVE_DIR;
  if (!directory || !isAbsolute(directory) || !/^[a-f0-9]{64}$/.test(process.env.SIGNING_SECRET ?? "")) throw new Error("configuration_missing");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let count = 0, offset = 0;
  while (true) {
    const result = await client.from("contract_signatures").select("signed_path,signed_sha256,evidence,evidence_seal").eq("status", "SIGNED").order("id").range(offset, offset + 99);
    if (result.error) throw new Error("signature_query_failed");
    for (const row of result.data) {
      if (!/^[a-f0-9]{64}$/.test(row.signed_sha256)) throw new Error("invalid_digest");
      const seal = createHmac("sha256", Buffer.from(process.env.SIGNING_SECRET, "hex")).update(`evidence:${canonical(row.evidence)}`).digest("hex");
      if (seal !== row.evidence_seal) throw new Error("evidence_integrity_failed");
      const file = join(directory, `${row.signed_sha256}.pdf`);
      const download = await client.storage.from("contract-signatures").download(row.signed_path);
      if (download.error || !download.data) throw new Error("cloud_download_failed");
      const bytes = Buffer.from(await download.data.arrayBuffer());
      if (digest(bytes) !== row.signed_sha256) throw new Error("cloud_integrity_failed");
      const temporary = join(directory, `.${randomUUID()}.tmp`);
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      try {
        try { await link(temporary, file); } catch (error) { if (error.code !== "EEXIST") throw error; }
        if (digest(await readFile(file)) !== row.signed_sha256) throw new Error("archive_integrity_failed");
      } finally { await unlink(temporary); }
      count++;
    }
    if (result.data.length < 100) break;
    offset += 100;
  }
  const folder = await open(directory, "r");
  try { await folder.sync(); } finally { await folder.close(); }
  console.log(JSON.stringify({ signedContracts: count, cloudVerified: count, archiveVerified: count }));
}
main().catch(error => { console.error("Archive verification failed:", error.message); process.exitCode = 1; });
