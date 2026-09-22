import { beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";
import { createProduct } from "../helpers/catalog";

/**
 * ProductCompatibilityEngine: motor determinístico, nunca a IA.
 * Cobre literalmente o exemplo do prompt mestre (seção 18): produto A contém
 * lactose (INCOMPATIBLE), produto B é sem lactose (COMPATIBLE), produto C não
 * tem a informação cadastrada (UNKNOWN — nunca tratado como seguro).
 */
describe("ProductCompatibilityEngine", () => {
  const db = useTestDatabase();
  let tenantId: string;
  let ownerId: string;
  let sellerId: string;
  let attributes: Record<string, string>;

  beforeAll(async () => {
    ownerId = await db.createUser();
    const [row] = await db
      .as(ownerId)
      .rpc<{ create_tenant: string }>("create_tenant", { p_name: "Gorila", p_segment: "supplements" });
    tenantId = row!.create_tenant;
    sellerId = await db.addActiveMember(tenantId, "VENDEDOR");
    const rows = await db
      .as(ownerId)
      .query<{ id: string; code: string }>("select id, code from public.product_attributes where tenant_id = $1", [
        tenantId,
      ]);
    attributes = Object.fromEntries(rows.map((r) => [r.code, r.id]));
  });

  async function optionId(attributeCode: string, code: string) {
    const [row] = await db.admin.query<{ id: string }>(
      `select o.id from public.product_attribute_options o
       join public.product_attributes a on a.id = o.attribute_id
       where a.tenant_id = $1 and a.code = $2 and o.code = $3`,
      [tenantId, attributeCode, code],
    );
    return row!.id;
  }

  it("the lactose example: contains → INCOMPATIBLE, free → COMPATIBLE, unknown → UNKNOWN", async () => {
    const productA = await createProduct(db, ownerId, tenantId, { name: "Produto A" });
    await db.as(ownerId).rpc("catalog_set_allergens", {
      p_product_id: productA.productId,
      p_allergens: JSON.stringify([{ code: "milk", presence: "TRUE", source: "LABEL" }]),
    });

    const productB = await createProduct(db, ownerId, tenantId, { name: "Produto B" });
    await db.as(ownerId).rpc("catalog_set_allergens", {
      p_product_id: productB.productId,
      p_allergens: JSON.stringify([{ code: "milk", presence: "FALSE", source: "LABEL" }]),
    });

    const productC = await createProduct(db, ownerId, tenantId, { name: "Produto C" });

    const requirements = JSON.stringify([{ level: "HEALTH_RELATED", type: "ALLERGEN_ABSENT", code: "milk" }]);
    const results = await db.as(sellerId).rpc<{ variant_id: string; status: string }>("catalog_check_compatibility", {
      p_tenant_id: tenantId,
      p_variant_ids: [productA.variantId, productB.variantId, productC.variantId],
      p_requirements: requirements,
    });
    const byVariant = Object.fromEntries(results.map((r) => [r.variant_id, r.status]));

    expect(byVariant[productA.variantId]).toBe("INCOMPATIBLE");
    expect(byVariant[productB.variantId]).toBe("COMPATIBLE");
    expect(byVariant[productC.variantId]).toBe("UNKNOWN");
  });

  it("overall status uses the worst evidence across multiple requirements", async () => {
    const { productId, variantId } = await createProduct(db, ownerId, tenantId, { name: "Multi" });
    await db.as(ownerId).rpc("catalog_set_allergens", {
      p_product_id: productId,
      p_allergens: JSON.stringify([{ code: "milk", presence: "FALSE", source: "LABEL" }]),
    });
    // glúten fica UNKNOWN (nunca cadastrado) — mesmo com lactose OK, o geral não pode virar COMPATIBLE.
    const requirements = JSON.stringify([
      { type: "ALLERGEN_ABSENT", code: "milk" },
      { type: "ALLERGEN_ABSENT", code: "gluten" },
    ]);
    const [result] = await db
      .as(sellerId)
      .rpc<{ status: string; results: { code: string; status: string }[] }>("catalog_check_compatibility", {
        p_tenant_id: tenantId,
        p_variant_ids: [variantId],
        p_requirements: requirements,
      });
    expect(result!.status).toBe("UNKNOWN");
    expect(result!.results).toHaveLength(2);
  });

  it("ATTRIBUTE_EQUALS only considers attributes flagged is_compatibility_enabled", async () => {
    const { productId, variantId } = await createProduct(db, ownerId, tenantId, { name: "Sabor" });
    await db.as(ownerId).rpc("catalog_set_attribute_values", {
      p_product_id: productId,
      p_values: JSON.stringify([{ attribute_id: attributes.flavor, value: await optionId("flavor", "chocolate") }]),
    });

    const matching = JSON.stringify([{ type: "ATTRIBUTE_EQUALS", code: "flavor", value: "chocolate" }]);
    const [match] = await db.as(sellerId).rpc<{ status: string }>("catalog_check_compatibility", {
      p_tenant_id: tenantId,
      p_variant_ids: [variantId],
      p_requirements: matching,
    });
    expect(match!.status).toBe("COMPATIBLE");

    const mismatching = JSON.stringify([{ type: "ATTRIBUTE_EQUALS", code: "flavor", value: "morango" }]);
    const [mismatch] = await db.as(sellerId).rpc<{ status: string }>("catalog_check_compatibility", {
      p_tenant_id: tenantId,
      p_variant_ids: [variantId],
      p_requirements: mismatching,
    });
    expect(mismatch!.status).toBe("INCOMPATIBLE");

    // Desativa is_compatibility_enabled para simular uma característica que o
    // lojista não quer que o motor considere (ex.: dado só informativo).
    await db.admin.query("update public.product_attributes set is_compatibility_enabled = false where id = $1", [
      attributes.net_weight,
    ]);
    await db.as(ownerId).rpc("catalog_set_attribute_values", {
      p_product_id: productId,
      p_values: JSON.stringify([{ attribute_id: attributes.net_weight, value: 900 }]),
    });
    const disabled = JSON.stringify([{ type: "ATTRIBUTE_EQUALS", code: "net_weight", value: "900" }]);
    const [result] = await db
      .as(sellerId)
      .rpc<{ status: string; results: { reason: string }[] }>("catalog_check_compatibility", {
        p_tenant_id: tenantId,
        p_variant_ids: [variantId],
        p_requirements: disabled,
      });
    expect(result!.status).toBe("UNKNOWN");
    expect(result!.results[0]!.reason).toBe("attribute_not_enabled_for_compatibility");
  });

  it("NUTRITION_MAX/MIN compares informed nutrients and stays UNKNOWN otherwise", async () => {
    const { productId, variantId } = await createProduct(db, ownerId, tenantId, { name: "Proteico" });
    await db.as(ownerId).rpc("catalog_set_nutrition", {
      p_product_id: productId,
      p_nutrition: JSON.stringify({
        serving_size: 30,
        serving_unit: "g",
        source: "LABEL",
        values: { protein: 24, total_sugars: 1 },
      }),
    });

    const requirements = JSON.stringify([
      { type: "NUTRITION_MIN", code: "protein", value: 20 },
      { type: "NUTRITION_MAX", code: "total_sugars", value: 2 },
      { type: "NUTRITION_MAX", code: "sodium", value: 100 },
    ]);
    const [result] = await db
      .as(sellerId)
      .rpc<{ status: string; results: { code: string; status: string }[] }>("catalog_check_compatibility", {
        p_tenant_id: tenantId,
        p_variant_ids: [variantId],
        p_requirements: requirements,
      });
    const byCode = Object.fromEntries(result!.results.map((r) => [r.code, r.status]));
    expect(byCode.protein).toBe("COMPATIBLE");
    expect(byCode.total_sugars).toBe("COMPATIBLE");
    expect(byCode.sodium).toBe("UNKNOWN");
    expect(result!.status).toBe("UNKNOWN");
  });

  it("PRICE_MAX compares the effective price, never UNKNOWN", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId, { name: "Caro", salePrice: 200 });
    const [result] = await db.as(sellerId).rpc<{ status: string }>("catalog_check_compatibility", {
      p_tenant_id: tenantId,
      p_variant_ids: [variantId],
      p_requirements: JSON.stringify([{ type: "PRICE_MAX", value: 150 }]),
    });
    expect(result!.status).toBe("INCOMPATIBLE");
  });

  it("rejects an unknown requirement type", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId);
    await expect(
      db.as(sellerId).rpc("catalog_check_compatibility", {
        p_tenant_id: tenantId,
        p_variant_ids: [variantId],
        p_requirements: JSON.stringify([{ type: "MADE_UP", code: "x" }]),
      }),
    ).rejects.toThrow("invalid_input");
  });
});
