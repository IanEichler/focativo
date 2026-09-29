import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ row: {} as Record<string, unknown>, download: vi.fn(), upload: vi.fn(), remove: vi.fn(), rpc: vi.fn(), receipt: vi.fn(), committed: false, path: "", archive: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./archive", () => ({ archiveSignedPdf: mock.archive }));
vi.mock("./pdf", () => ({ appendSignatureReceipt: mock.receipt }));
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
  mock.row = { id: "request", tenant_id: "tenant", status: "PENDING", authentication_method: "unique_link", expires_at: "2100-01-01", signer_name: "Pessoa Teste", signer_email: "", signer_document: "00000000000",
    session_hash: hash(session), session_expires_at: "2100-01-01", verified_at: "2026-09-29T20:00:00Z", viewed_at: "2026-09-29T20:01:00Z", original_path: "original", original_sha256: hash("original") };
  mock.download.mockResolvedValue({ data: new Blob(["original"]), error: null });
  mock.receipt.mockResolvedValue(Buffer.from("signed"));
  mock.upload.mockImplementation(async path => { mock.path = path; return { error: null }; });
  mock.archive.mockResolvedValue(undefined);
  mock.rpc.mockResolvedValue({ data: { ok: true }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it("requires PDF review and explicit consent before signing", async () => {
  const viewed = mock.row.viewed_at; mock.row.viewed_at = null;
  await expect(signContract(token, input, new Headers())).rejects.toMatchObject({ code: "review_required" });
  mock.row.viewed_at = viewed;
  await expect(signContract(token, { ...input, accepted: false }, new Headers())).rejects.toMatchObject({ code: "consent_required" });
  expect(mock.download).not.toHaveBeenCalled(); expect(mock.rpc).not.toHaveBeenCalled();
});
it("refuses a modified original PDF", async () => {
  mock.download.mockResolvedValue({ data: new Blob(["modified"]), error: null });
  await expect(signContract(token, input, new Headers())).rejects.toMatchObject({ code: "integrity_error" });
  expect(mock.upload).not.toHaveBeenCalled();
});
it("preserves the signed PDF when a connection error hides a successful commit", async () => {
  mock.rpc.mockImplementation(async () => { mock.committed = true; return { data: null, error: { message: "timeout" } }; });
  await expect(signContract(token, input, new Headers())).resolves.toBeUndefined();
  expect(mock.remove).not.toHaveBeenCalled();
});
it("removes only the uncommitted candidate when revocation wins the race", async () => {
  mock.rpc.mockResolvedValue({ data: { error: "unavailable" }, error: null });
  await expect(signContract(token, input, new Headers())).rejects.toMatchObject({ code: "unavailable" });
  expect(mock.remove).toHaveBeenCalledWith([mock.path]);
});

it("records a link signature without email, session cookie or a false verification claim", async () => {
  mock.row.session_hash = null; mock.row.verified_at = null;
  await signContract(token, input, new Headers());
  expect(mock.rpc).toHaveBeenCalledWith("signature_complete_link", expect.objectContaining({ p_evidence: expect.objectContaining({ authentication: "unique_link", version: 3, signerEmail: "" }) }));
  expect(mock.rpc.mock.calls[0][1].p_evidence).not.toHaveProperty("verifiedAt");
});

it("seals proxy IP and permitted browser coordinates in the same evidence sent to the PDF and database", async () => {
  vi.stubEnv("SIGNING_TRUST_PROXY", "true");
  const location = { status: "captured" as const, source: "browser_geolocation" as const, latitude: -15.6, longitude: -56.1, accuracyMeters: 30, capturedAt: "2026-09-29T20:00:00.000Z" };
  await signContract(token, { ...input, location }, new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }));
  const payload = mock.rpc.mock.calls[0][1];
  expect(payload.p_evidence).toMatchObject({ version: 3, ip: "203.0.113.7", location });
  expect(mock.receipt).toHaveBeenCalledWith(expect.any(Buffer), payload.p_evidence, payload.p_seal, undefined);
});

it.each(["false", "true"])("does not trust forwarded-for alone (trust proxy=%s)", async trust => {
  vi.stubEnv("SIGNING_TRUST_PROXY", trust);
  await signContract(token, { ...input, location: { status: "denied" } }, new Headers({ "x-forwarded-for": "198.51.100.1", ...(trust === "false" ? { "x-real-ip": "203.0.113.7" } : {}) }));
  expect(mock.rpc.mock.calls[0][1].p_evidence).toMatchObject({ ip: null, location: { status: "denied" } });
});

it("records IPv6 and rejects malformed real-IP headers", async () => {
  vi.stubEnv("SIGNING_TRUST_PROXY", "true");
  await signContract(token, input, new Headers({ "x-real-ip": "2001:db8::1" }));
  expect(mock.rpc.mock.calls[0][1].p_evidence.ip).toBe("2001:db8::1");
  await signContract(token, input, new Headers({ "x-real-ip": "203.0.113.7, 198.51.100.1" }));
  expect(mock.rpc.mock.calls[1][1].p_evidence.ip).toBeNull();
});
it("rejects expired and revoked bearer links", async () => {
  mock.row.expires_at = "2000-01-01";
  await expect(signContract(token, input, new Headers())).rejects.toMatchObject({ code: "unavailable" });
  mock.row.expires_at = "2100-01-01"; mock.row.status = "REVOKED";
  await expect(signContract(token, input, new Headers())).rejects.toMatchObject({ code: "unavailable" });
  expect(mock.upload).not.toHaveBeenCalled();
});

it("does not finalize a signature if the durable archive cannot be written", async () => {
  mock.archive.mockRejectedValueOnce(new Error("disk unavailable"));
  await expect(signContract(token, input, new Headers())).rejects.toThrow("disk unavailable");
  expect(mock.upload).not.toHaveBeenCalled();
  expect(mock.rpc).not.toHaveBeenCalled();
});
