import { describe, expect, it } from "vitest";
import { createChargeSchema } from "./schemas";

describe("createChargeSchema", () => {
  it("accepts a valid method", () => {
    const result = createChargeSchema.safeParse({
      reservationId: "123e4567-e89b-12d3-a456-426614174000",
      method: "pix",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid method", () => {
    const result = createChargeSchema.safeParse({
      reservationId: "123e4567-e89b-12d3-a456-426614174000",
      method: "boleto",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed reservationId", () => {
    const result = createChargeSchema.safeParse({ reservationId: "not-a-uuid", method: "pix" });
    expect(result.success).toBe(false);
  });
});
