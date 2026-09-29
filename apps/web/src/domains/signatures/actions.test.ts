import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ can: vi.fn(), user: vi.fn(), backend: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/domains/tenants/context", () => ({ requireTenantContext: async () => ({ tenant: { id: "tenant" }, hasModule: () => true, can: mock.can }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.user }));
vi.mock("./client", () => ({ signingClient: mock.backend }));
import { createSignatureLinkAction, signatureStatusAction } from "./actions";
import { encryptToken } from "./security";
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());
it("requires write permission before creating public links", async () => {
  mock.can.mockReturnValue(false);
  const response = await createSignatureLinkAction("11111111-1111-4111-8111-111111111111");
  expect(response.status).toBe("error"); expect(mock.can).toHaveBeenCalledWith("documents.write");
  expect(mock.backend).not.toHaveBeenCalled();
});
it("returns a reusable signature link with no customer email or mail provider", async () => {
  vi.stubEnv("SIGNING_SECRET", "a".repeat(64));
  vi.stubEnv("SIGNING_PUBLIC_URL", "https://sign.example.test");
  vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("SIGNING_EMAIL_FROM", "");
  mock.can.mockReturnValue(true);
  const token = "a".repeat(43);
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: "document", customer_id: "customer" }, error: null }) };
  mock.user.mockResolvedValue({ from: () => query });
  const backend = { select: () => backend, eq: () => backend, maybeSingle: async () => ({ data: { status: "PENDING", signer_email: "", signer_name: "Pessoa Teste", signer_document: "00000000000", expires_at: "2100-01-01", token_cipher: encryptToken(token) }, error: null }) };
  mock.backend.mockReturnValue({ from: () => backend });
  expect(await createSignatureLinkAction("11111111-1111-4111-8111-111111111111")).toMatchObject({ status: "success", url: `https://sign.example.test/assinar/${token}` });
});
it("checks user RLS access before querying privileged signing data", async () => {
  mock.can.mockReturnValue(true);
  const query = { select: () => query, eq: vi.fn(() => query), maybeSingle: async () => ({ data: null, error: null }) };
  mock.user.mockResolvedValue({ from: () => query });
  const response = await signatureStatusAction("11111111-1111-4111-8111-111111111111");
  expect(response.status).toBe("error"); expect(query.eq).toHaveBeenCalledWith("tenant_id", "tenant");
  expect(mock.backend).not.toHaveBeenCalled();
});
