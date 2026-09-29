import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), customers: vi.fn(), inventory: vi.fn(), products: vi.fn() }));
vi.mock("@/domains/tenants/context", () => ({ getTenantContext: mocks.context }));
vi.mock("@/domains/customers/queries", () => ({ lookupCustomers: mocks.customers }));
vi.mock("@/domains/inventory/queries", () => ({ lookupVariants: mocks.inventory }));
vi.mock("@/domains/catalog/search", () => ({ searchVariants: mocks.products }));
import { GET } from "./route";
const call = (query: string) => GET(new Request(`http://localhost/api/search?${query}`));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ can: () => true, tenant: { id: "active" } });
});
it("does not return data without authentication or permission", async () => {
  mocks.context.mockResolvedValueOnce(null);
  expect((await call("kind=customers")).status).toBe(401);
  mocks.context.mockResolvedValueOnce({ can: () => false });
  expect((await call("kind=customers")).status).toBe(403);
  expect(mocks.customers).not.toHaveBeenCalled();
});
it("uses the authenticated tenant and never caches personal search results", async () => {
  mocks.customers.mockResolvedValue([{ id: "one", name: "Ana" }]);
  const response = await call("kind=customers&q=%20Ana%20&tenant=forged");
  expect(mocks.customers).toHaveBeenCalledWith(expect.objectContaining({ tenant: { id: "active" } }), "Ana");
  expect(await response.json()).toEqual([{ id: "one", name: "Ana" }]);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("preserves stock and compatibility filters in product searches", async () => {
  mocks.products.mockResolvedValue({ rows: [{ variantId: "one" }] });
  const requirements = [{ type: "ALLERGEN_ABSENT", code: "milk", level: "HEALTH_RELATED" }];
  expect(
    (await call(`kind=products&inStock=true&requirements=${encodeURIComponent(JSON.stringify(requirements))}`)).status,
  ).toBe(200);
  expect(mocks.products).toHaveBeenCalledWith(expect.anything(), {
    query: "",
    inStockOnly: true,
    requirements,
    limit: 15,
  });
});
it("rejects malformed and excessive search parameters", async () => {
  for (const query of ["kind=unknown", "kind=products&requirements=oops", `kind=customers&q=${"a".repeat(101)}`]) {
    expect((await call(query)).status).toBe(400);
  }
  expect(mocks.context).not.toHaveBeenCalled();
});
it("reports a failed lookup instead of an empty successful search", async () => {
  mocks.inventory.mockRejectedValue(new Error("database"));
  expect((await call("kind=inventory&q=a")).status).toBe(500);
});
