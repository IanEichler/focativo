import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ row: {} as Record<string, unknown>, download: vi.fn(), upload: vi.fn(), remove: vi.fn(), rpc: vi.fn(), receipt: vi.fn(), committed: false, path: "" }));
vi.mock("server-only", () => ({}));
vi.mock("./pdf", () => ({ appendSignatureReceipt: mock.receipt }));
vi.mock("./mail", () => ({ sendSignatureCode: vi.fn() }));
vi.mock("./client", () => ({ signingClient: () => ({
  from: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: mock.committed ? { ...mock.row, status: "SIGNED", signed_path: mock.path } : mock.row, error: null }) };
    return query;
  },
  storage: { from: () => ({ download: mock.download, upload: mock.upload, remove: mock.remove }) }, rpc: mock.rpc,
}) }));
import { hash, CONSENT_VERSION } from "./security";
import { signContract } from "./service";
const token = "a".repeat(43), session = "b".repeat(43);
const input = { name: "Pessoa Teste", accepted: true, consentVersion: CONSENT_VERSION };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("SIGNING_SECRET", "a".repeat(64)); mock.committed = false;
  mock.row = { id: "request", tenant_id: "tenant", status: "PENDING", expires_at: "2100-01-01", signer_name: "Pessoa Teste", signer_email: "test@example.test", signer_document: "00000000000",
    session_hash: hash(session), session_expires_at: "2100-01-01", verified_at: "2026-09-29T20:00:00Z", viewed_at: "2026-09-29T20:01:00Z", original_path: "original", original_sha256: hash("original") };
  mock.download.mockResolvedValue({ data: new Blob(["original"]), error: null });
  mock.receipt.mockResolvedValue(Buffer.from("signed"));
  mock.upload.mockImplementation(async path => { mock.path = path; return { error: null }; });
  mock.rpc.mockResolvedValue({ data: { ok: true }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it("requires a verified session and explicit consent before reading or signing", async () => {
  await expect(signContract(token, undefined, input, new Headers())).rejects.toMatchObject({ code: "verification_required" });
  await expect(signContract(token, session, { ...input, accepted: false }, new Headers())).rejects.toMatchObject({ code: "consent_required" });
  expect(mock.download).not.toHaveBeenCalled(); expect(mock.rpc).not.toHaveBeenCalled();
});
it("refuses a modified original PDF", async () => {
  mock.download.mockResolvedValue({ data: new Blob(["modified"]), error: null });
  await expect(signContract(token, session, input, new Headers())).rejects.toMatchObject({ code: "integrity_error" });
  expect(mock.upload).not.toHaveBeenCalled();
});
it("preserves the signed PDF when a connection error hides a successful commit", async () => {
  mock.rpc.mockImplementation(async () => { mock.committed = true; return { data: null, error: { message: "timeout" } }; });
  await expect(signContract(token, session, input, new Headers())).resolves.toBeUndefined();
  expect(mock.remove).not.toHaveBeenCalled();
});
it("removes only the uncommitted candidate when revocation wins the race", async () => {
  mock.rpc.mockResolvedValue({ data: { error: "unavailable" }, error: null });
  await expect(signContract(token, session, input, new Headers())).rejects.toMatchObject({ code: "unavailable" });
  expect(mock.remove).toHaveBeenCalledWith([mock.path]);
});
