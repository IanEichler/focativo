import { beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";
import { createProduct } from "../helpers/catalog";

describe("busca estruturada e recomendação (catalog_search_variants)", () => {
  const db = useTestDatabase();
  let tenantId: string;
  let ownerId: string;

  beforeAll(async () => {
    const owner = await db.createTenantWithOwner("Gorila Suplementos");
    tenantId = owner.tenantId;
    ownerId = owner.ownerId;
  });

  async function search(overrides: Record<string, unknown> = {}) {
    return db.as(ownerId).rpc<{
      variant_id: string;
      product_name: string;
      compatibility_status: string;
      current_price: string;
      available_quantity: string;
      total_count: string;
    }>("catalog_search_variants", { p_tenant_id: tenantId, ...overrides });
  }

  it("filters by text across product name", async () => {
    await createProduct(db, ownerId, tenantId, { name: "Whey Isolado 900g" });
    await createProduct(db, ownerId, tenantId, { name: "Creatina Monohidratada" });

    const rows = await search({ p_query: "whey" });
    expect(rows.map((r) => r.product_name)).toEqual(["Whey Isolado 900g"]);
  });

  it("filters by price range", async () => {
    await createProduct(db, ownerId, tenantId, { name: "Barato", salePrice: 50 });
    await createProduct(db, ownerId, tenantId, { name: "Caro", salePrice: 500 });

    const rows = await search({ p_query: "Barato", p_price_max: 100 });
    expect(rows.map((r) => r.product_name)).toEqual(["Barato"]);

    const none = await search({ p_query: "Caro", p_price_max: 100 });
    expect(none).toHaveLength(0);
  });

  it("filters by stock when p_in_stock_only is true", async () => {
    const withStock = await createProduct(db, ownerId, tenantId, { name: "Com Estoque XYZ" });
    await db.as(ownerId).rpc("inventory_register_entry", {
      p_variant_id: withStock.variantId,
      p_quantity: 10,
      p_idempotency_key: `seed:${withStock.variantId}`,
    });
    await createProduct(db, ownerId, tenantId, { name: "Sem Estoque XYZ" });

    const rows = await search({ p_query: "XYZ", p_in_stock_only: true });
    expect(rows.map((r) => r.product_name)).toEqual(["Com Estoque XYZ"]);
  });

  it("ranks compatible results before unknown and incompatible ones", async () => {
    const compatible = await createProduct(db, ownerId, tenantId, { name: "Rank Compatível" });
    await db.as(ownerId).rpc("catalog_set_allergens", {
      p_product_id: compatible.productId,
      p_allergens: JSON.stringify([{ code: "milk", presence: "FALSE", source: "LABEL" }]),
    });
    const incompatible = await createProduct(db, ownerId, tenantId, { name: "Rank Incompatível" });
    await db.as(ownerId).rpc("catalog_set_allergens", {
      p_product_id: incompatible.productId,
      p_allergens: JSON.stringify([{ code: "milk", presence: "TRUE", source: "LABEL" }]),
    });
    const unknown = await createProduct(db, ownerId, tenantId, { name: "Rank Desconhecido" });

    const requirements = JSON.stringify([{ type: "ALLERGEN_ABSENT", code: "milk" }]);
    const rows = await search({ p_query: "Rank", p_requirements: requirements });

    expect(rows.map((r) => r.product_name)).toEqual(["Rank Compatível", "Rank Desconhecido", "Rank Incompatível"]);
    expect(rows.map((r) => r.compatibility_status)).toEqual(["COMPATIBLE", "UNKNOWN", "INCOMPATIBLE"]);
  });

  it("p_exclude_incompatible hides incompatible results without hiding unknown ones", async () => {
    const compatible = await createProduct(db, ownerId, tenantId, { name: "Excl Compatível" });
    await db.as(ownerId).rpc("catalog_set_allergens", {
      p_product_id: compatible.productId,
      p_allergens: JSON.stringify([{ code: "milk", presence: "FALSE", source: "LABEL" }]),
    });
    const incompatible = await createProduct(db, ownerId, tenantId, { name: "Excl Incompatível" });
    await db.as(ownerId).rpc("catalog_set_allergens", {
      p_product_id: incompatible.productId,
      p_allergens: JSON.stringify([{ code: "milk", presence: "TRUE", source: "LABEL" }]),
    });

    const requirements = JSON.stringify([{ type: "ALLERGEN_ABSENT", code: "milk" }]);
    const rows = await search({ p_query: "Excl", p_requirements: requirements, p_exclude_incompatible: true });
    expect(rows.map((r) => r.product_name)).toEqual(["Excl Compatível"]);
  });

  it("sorts by price when requested", async () => {
    await createProduct(db, ownerId, tenantId, { name: "Preço Sort A", salePrice: 300 });
    await createProduct(db, ownerId, tenantId, { name: "Preço Sort B", salePrice: 100 });
    await createProduct(db, ownerId, tenantId, { name: "Preço Sort C", salePrice: 200 });

    const asc = await search({ p_query: "Preço Sort", p_sort: "price_asc" });
    expect(asc.map((r) => r.product_name)).toEqual(["Preço Sort B", "Preço Sort C", "Preço Sort A"]);
  });

  it("returns total_count independent of pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await createProduct(db, ownerId, tenantId, { name: `Paginação ${i}` });
    }
    const page1 = await search({ p_query: "Paginação", p_limit: 2, p_offset: 0 });
    expect(page1).toHaveLength(2);
    expect(Number(page1[0]!.total_count)).toBe(5);
  });

  it("rejects a non-array requirements payload", async () => {
    await expect(search({ p_requirements: JSON.stringify({ type: "PRICE_MAX" }) })).rejects.toThrow("invalid_input");
  });

  it("never returns variants from another tenant", async () => {
    const other = await db.createTenantWithOwner("Outra Loja");
    await createProduct(db, other.ownerId, other.tenantId, { name: "Produto Isolado Único" });
    const rows = await search({ p_query: "Isolado Único" });
    expect(rows).toHaveLength(0);
  });
});
