import { describe, expect, it } from "vitest";
import { reservationSchema } from "./schemas";

describe("reservationSchema", () => {
  it("requires a valid customerId", () => {
    const result = reservationSchema.safeParse({
      customerId: "not-a-uuid",
      items: JSON.stringify([{ variantId: "123e4567-e89b-12d3-a456-426614174000", quantity: 1 }]),
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one item", () => {
    const result = reservationSchema.safeParse({
      customerId: "123e4567-e89b-12d3-a456-426614174000",
      items: JSON.stringify([]),
    });
    expect(result.success).toBe(false);
  });

  it("parses a valid reservation payload", () => {
    const result = reservationSchema.safeParse({
      customerId: "123e4567-e89b-12d3-a456-426614174000",
      items: JSON.stringify([{ variantId: "223e4567-e89b-12d3-a456-426614174000", quantity: 3 }]),
      expiresAt: "2026-12-31T23:59",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toEqual([{ variantId: "223e4567-e89b-12d3-a456-426614174000", quantity: 3 }]);
      expect(result.data.expiresAt).toBe("2026-12-31T23:59");
    }
  });
});
