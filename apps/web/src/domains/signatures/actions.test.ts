import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ can: vi.fn(), user: vi.fn(), backend: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/domains/tenants/context", () => ({ requireTenantContext: async () => ({ tenant: { id: "tenant" }, hasModule: () => true, can: mock.can }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.user }));
vi.mock("./client", () => ({ signingClient: mock.backend }));
import { createSignatureLinkAction, signatureStatusAction } from "./actions";
beforeEach(() => vi.clearAllMocks());
it("requires write permission before creating public links", async () => {
  mock.can.mockReturnValue(false);
  const response = await createSignatureLinkAction("11111111-1111-4111-8111-111111111111");
  expect(response.status).toBe("error"); expect(mock.can).toHaveBeenCalledWith("documents.write");
  expect(mock.backend).not.toHaveBeenCalled();
});
it("checks user RLS access before querying privileged signing data", async () => {
  mock.can.mockReturnValue(true);
  const query = { select: () => query, eq: vi.fn(() => query), maybeSingle: async () => ({ data: null, error: null }) };
  mock.user.mockResolvedValue({ from: () => query });
  const response = await signatureStatusAction("11111111-1111-4111-8111-111111111111");
  expect(response.status).toBe("error"); expect(query.eq).toHaveBeenCalledWith("tenant_id", "tenant");
  expect(mock.backend).not.toHaveBeenCalled();
});
