import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useTestDatabase } from "../../src/harness/test-db";
import { createProduct } from "../helpers/catalog";

describe("product characteristics", () => {
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
    const attributeRows = await db
      .as(ownerId)
      .query<{ id: string; code: string }>("select id, code from public.product_attributes where tenant_id = $1", [tenantId]);
    attributes = Object.fromEntries(attributeRows.map((attribute) => [attribute.code, attribute.id]));
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

  describe("allergens (TRUE / FALSE / UNKNOWN)", () => {
    it("absence of information is UNKNOWN for every catalog allergen", async () => {
      const { variantId } = await createProduct(db, ownerId, tenantId);
      const rows = await db
        .as(sellerId)
        .query<{ allergen_code: string; presence: string; defined_at: string }>(
          "select allergen_code, presence, defined_at from public.effective_variant_allergens where variant_id = $1",
          [variantId],
        );
      expect(rows.length).toBe(10);
      expect(rows.every((row) => row.presence === "UNKNOWN" && row.defined_at === "NONE")).toBe(true);
    });

    it("stores explicit presence, traces and source; variant overrides product", async () => {
      const { productId, variantId } = await createProduct(db, ownerId, tenantId, { name: "Whey" });
      const [second] = await db.as(ownerId).rpc<{ catalog_upsert_variant: string }>("catalog_upsert_variant", {
        p_product_id: productId,
        p_name: "Cookies",
      });
      const cookiesId = second!.catalog_upsert_variant;

      await db.as(ownerId).rpc("catalog_set_allergens", {
        p_product_id: productId,
        p_allergens: JSON.stringify([
          { code: "lactose", presence: "FALSE", source: "LABEL" },
          { code: "soy", presence: "FALSE", may_contain_traces: true, source: "LABEL" },
          { code: "milk", presence: "TRUE", source: "LABEL" },
          { code: "gluten", presence: "UNKNOWN", source: "MANUAL" },
        ]),
      });
      await db.as(ownerId).rpc("catalog_set_allergens", {
        p_product_id: productId,
        p_variant_id: cookiesId,
        p_allergens: JSON.stringify([{ code: "gluten", presence: "TRUE", source: "LABEL" }]),
      });

      const effective = async (id: string) =>
        Object.fromEntries(
          (
            await db
              .as(sellerId)
              .query<{ allergen_code: string; presence: string; may_contain_traces: boolean; defined_at: string }>(
                "select allergen_code, presence, may_contain_traces, defined_at from public.effective_variant_allergens where variant_id = $1",
                [id],
              )
          ).map((row) => [row.allergen_code, row]),
        );

      const base = await effective(variantId);
      expect(base.lactose).toMatchObject({ presence: "FALSE", defined_at: "PRODUCT" });
      expect(base.soy).toMatchObject({ presence: "FALSE", may_contain_traces: true });
      expect(base.gluten).toMatchObject({ presence: "UNKNOWN", defined_at: "NONE" });

      const cookies = await effective(cookiesId);
      expect(cookies.gluten).toMatchObject({ presence: "TRUE", defined_at: "VARIANT" });
      expect(cookies.lactose).toMatchObject({ presence: "FALSE", defined_at: "PRODUCT" });

      const audit = await db.admin.query("select id from public.audit_logs where action = 'product.allergens_updated'");
      expect(audit.length).toBeGreaterThanOrEqual(2);
    });

    it("rejects traces together with CONTAINS and sellers cannot edit", async () => {
      const { productId } = await createProduct(db, ownerId, tenantId);
      await expectDbError(
        db.as(ownerId).rpc("catalog_set_allergens", {
          p_product_id: productId,
          p_allergens: JSON.stringify([{ code: "milk", presence: "TRUE", may_contain_traces: true, source: "LABEL" }]),
        }),
        "invalid_input",
      );
      await expectDbError(
        db.as(sellerId).rpc("catalog_set_allergens", { p_product_id: productId, p_allergens: "[]" }),
        "forbidden",
      );
    });
  });

  describe("nutrition", () => {
    it("never turns a missing nutrient into zero", async () => {
      const { productId, variantId } = await createProduct(db, ownerId, tenantId);
      await db.as(ownerId).rpc("catalog_set_nutrition", {
        p_product_id: productId,
        p_nutrition: JSON.stringify({
          serving_size: 30,
          serving_unit: "g",
          serving_description: "1 scoop (30 g)",
          servings_per_container: 30,
          source: "LABEL",
          values: { protein: 24, carbohydrates: 4.2, total_sugars: 0, sodium: null },
        }),
      });

      const [row] = await db
        .as(sellerId)
        .query<{ nutrient_values: Record<string, number>; source: string }>(
          "select nutrient_values, source from public.effective_variant_nutrition where variant_id = $1",
          [variantId],
        );
      expect(row!.source).toBe("LABEL");
      expect(row!.nutrient_values).toEqual({ protein: 24, carbohydrates: 4.2, total_sugars: 0 });
      expect("sodium" in row!.nutrient_values).toBe(false);
    });

    it("requires source and valid nutrients; null removes the table", async () => {
      const { productId, variantId } = await createProduct(db, ownerId, tenantId);
      await expectDbError(
        db.as(ownerId).rpc("catalog_set_nutrition", {
          p_product_id: productId,
          p_nutrition: JSON.stringify({ serving_size: 30, serving_unit: "g", values: { protein: 20 } }),
        }),
        "invalid_input",
      );
      await expectDbError(
        db.as(ownerId).rpc("catalog_set_nutrition", {
          p_product_id: productId,
          p_nutrition: JSON.stringify({ serving_size: 30, serving_unit: "g", source: "LABEL", values: { made_up: 1 } }),
        }),
        "invalid_input",
      );

      await db.as(ownerId).rpc("catalog_set_nutrition", {
        p_product_id: productId,
        p_nutrition: JSON.stringify({ serving_size: 30, serving_unit: "g", source: "MANUAL", values: { protein: 20 } }),
      });
      await db.as(ownerId).rpc("catalog_set_nutrition", { p_product_id: productId, p_nutrition: null });
      expect(
        await db.as(sellerId).query("select * from public.effective_variant_nutrition where variant_id = $1", [variantId]),
      ).toHaveLength(0);
    });
  });

  describe("attributes", () => {
    it("validates value types and option ownership", async () => {
      const { productId } = await createProduct(db, ownerId, tenantId);
      await expectDbError(
        db.as(ownerId).rpc("catalog_set_attribute_values", {
          p_product_id: productId,
          p_values: JSON.stringify([{ attribute_id: attributes.net_weight, value: "novecentos" }]),
        }),
        "invalid_attribute_value",
      );
      await expectDbError(
        db.as(ownerId).rpc("catalog_set_attribute_values", {
          p_product_id: productId,
          p_values: JSON.stringify([{ attribute_id: attributes.flavor, value: await optionId("presentation", "po") }]),
        }),
        "invalid_attribute_value",
      );
    });

    it("resolves effective values with variant overrides", async () => {
      const { productId, variantId } = await createProduct(db, ownerId, tenantId, { name: "Whey Max" });
      const [second] = await db.as(ownerId).rpc<{ catalog_upsert_variant: string }>("catalog_upsert_variant", {
        p_product_id: productId,
        p_name: "Morango",
      });

      await db.as(ownerId).rpc("catalog_set_attribute_values", {
        p_product_id: productId,
        p_values: JSON.stringify([
          { attribute_id: attributes.flavor, value: await optionId("flavor", "chocolate") },
          { attribute_id: attributes.net_weight, value: 900 },
          { attribute_id: attributes.sugar_free_claim, value: false },
        ]),
      });
      await db.as(ownerId).rpc("catalog_set_attribute_values", {
        p_product_id: productId,
        p_variant_id: second!.catalog_upsert_variant,
        p_values: JSON.stringify([{ attribute_id: attributes.flavor, value: await optionId("flavor", "morango") }]),
      });

      const values = async (id: string) =>
        Object.fromEntries(
          (
            await db
              .as(sellerId)
              .query<{ attribute_code: string; option_code: string | null; value_number: string | null; value_boolean: boolean | null; defined_at: string }>(
                "select attribute_code, option_code, value_number, value_boolean, defined_at from public.effective_variant_attributes where variant_id = $1",
                [id],
              )
          ).map((row) => [row.attribute_code, row]),
        );

      const base = await values(variantId);
      expect(base.flavor!.option_code).toBe("chocolate");
      expect(Number(base.net_weight!.value_number)).toBe(900);
      expect(base.sugar_free_claim!.value_boolean).toBe(false);
      expect(base.vegan).toBeUndefined();

      const strawberry = await values(second!.catalog_upsert_variant);
      expect(strawberry.flavor).toMatchObject({ option_code: "morango", defined_at: "VARIANT" });
      expect(Number(strawberry.net_weight!.value_number)).toBe(900);
    });
  });
});
