import { describe, expect, it } from "vitest";
import { toCode, searchNormalize } from "@/lib/codes";
import { adjustSchema, entrySchema, lossSchema } from "@/domains/inventory/schemas";
import { flattenCategoryTree } from "./category-tree";
import { allergenEntrySchema, productSchema } from "./schemas";

const uuid = "8b3f7a2e-4f59-4c6a-9a9d-1c2b3d4e5f60";

describe("codes", () => {
  it("builds snake_case codes from labels", () => {
    expect(toCode("Cookies & Cream")).toBe("cookies_cream");
    expect(toCode("  Açúcar Mascavo! ")).toBe("acucar_mascavo");
    expect(searchNormalize("Protéico AÇAÍ")).toBe("proteico acai");
  });
});

describe("category tree", () => {
  it("orders depth-first with paths", () => {
    const rows = [
      { id: "c", name: "Whey", parent_id: "b", is_active: true, sort_order: 0 },
      { id: "a", name: "Vitaminas", parent_id: null, is_active: true, sort_order: 1 },
      { id: "b", name: "Proteínas", parent_id: null, is_active: true, sort_order: 0 },
    ];
    expect(flattenCategoryTree(rows).map((item) => [item.path, item.depth])).toEqual([
      ["Proteínas", 0],
      ["Proteínas › Whey", 1],
      ["Vitaminas", 0],
    ]);
  });
});

describe("product schema", () => {
  const base = { name: "Whey 900g", unit: "UN", salePrice: "149,90" };

  it("normalizes codes, prices and sentinels", () => {
    const parsed = productSchema.parse({
      ...base,
      sku: "why-900",
      promoPrice: "139,90",
      categoryId: "__none__",
      brandId: uuid,
      trackLots: "on",
    });
    expect(parsed).toMatchObject({
      sku: "WHY-900",
      salePrice: 149.9,
      promoPrice: 139.9,
      categoryId: null,
      brandId: uuid,
      trackLots: true,
      isActive: false,
      minStock: 0,
    });
  });

  it("requires promo below sale price", () => {
    const result = productSchema.safeParse({ ...base, promoPrice: "149,90" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(["promoPrice"]);
  });

  it("rejects allergen traces unless absent", () => {
    const entry = { code: "milk", presence: "TRUE", mayContainTraces: true, source: "LABEL", notes: null };
    expect(allergenEntrySchema.safeParse(entry).success).toBe(false);
    expect(allergenEntrySchema.safeParse({ ...entry, presence: "FALSE" }).success).toBe(true);
  });
});

describe("inventory schemas", () => {
  const key = "form-key-123456";

  it("entry validates quantity and date order", () => {
    expect(entrySchema.safeParse({ variantId: uuid, idempotencyKey: key, quantity: "0" }).success).toBe(false);
    const bad = entrySchema.safeParse({
      variantId: uuid,
      idempotencyKey: key,
      quantity: "5",
      manufacturedOn: "2026-10-01",
      expiresOn: "2026-09-01",
    });
    expect(bad.success).toBe(false);
  });

  it("loss requires reason; adjustment accepts counting zero", () => {
    expect(lossSchema.safeParse({ variantId: uuid, idempotencyKey: key, quantity: "1", reason: "" }).success).toBe(
      false,
    );
    const adjusted = adjustSchema.parse({
      variantId: uuid,
      idempotencyKey: key,
      countedQuantity: "0",
      reason: "Inventário",
      lotId: "__new__",
      lotCode: "L1",
    });
    expect(adjusted).toMatchObject({ countedQuantity: 0, lotId: null, lotCode: "L1" });
  });
});
