import { describe, expect, it } from "vitest";
import { saleSchema } from "./schemas";

describe("saleSchema", () => {
  const validItems = JSON.stringify([{ variantId: "123e4567-e89b-12d3-a456-426614174000", quantity: 2 }]);

  it("requires at least one item", () => {
    const result = saleSchema.safeParse({ items: JSON.stringify([]) });
    expect(result.success).toBe(false);
  });

  it("rejects malformed items JSON", () => {
    const result = saleSchema.safeParse({ items: "{not json" });
    expect(result.success).toBe(false);
  });

  it("parses valid items and defaults origin to BALCAO", () => {
    const result = saleSchema.safeParse({ items: validItems });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toEqual([{ variantId: "123e4567-e89b-12d3-a456-426614174000", quantity: 2 }]);
      expect(result.data.origin).toBe("BALCAO");
    }
  });

  it("falls back to BALCAO for an unknown origin", () => {
    const result = saleSchema.safeParse({ items: validItems, origin: "MARTE" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.origin).toBe("BALCAO");
  });

  it("normalizes the __none__ sentinel for paymentMethod", () => {
    const result = saleSchema.safeParse({ items: validItems, paymentMethod: "__none__" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.paymentMethod).toBeNull();
  });
});
