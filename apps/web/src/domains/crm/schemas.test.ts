import { describe, expect, it } from "vitest";
import { opportunitySchema, stageSchema } from "./schemas";

describe("opportunitySchema", () => {
  it("requires a valid customerId", () => {
    const result = opportunitySchema.safeParse({ customerId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("parses variantIds from a JSON array string", () => {
    const result = opportunitySchema.safeParse({
      customerId: "123e4567-e89b-12d3-a456-426614174000",
      variantIds: JSON.stringify(["a", "b"]),
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.variantIds).toEqual(["a", "b"]);
  });

  it("defaults variantIds to an empty array when omitted", () => {
    const result = opportunitySchema.safeParse({ customerId: "123e4567-e89b-12d3-a456-426614174000" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.variantIds).toEqual([]);
  });

  it("rejects malformed variantIds JSON", () => {
    const result = opportunitySchema.safeParse({
      customerId: "123e4567-e89b-12d3-a456-426614174000",
      variantIds: "{not json",
    });
    expect(result.success).toBe(false);
  });

  it("rejects variantIds that is valid JSON but not an array of strings", () => {
    const result = opportunitySchema.safeParse({
      customerId: "123e4567-e89b-12d3-a456-426614174000",
      variantIds: JSON.stringify([1, 2]),
    });
    expect(result.success).toBe(false);
  });
});

describe("stageSchema", () => {
  it("requires a non-empty name", () => {
    const result = stageSchema.safeParse({ id: "123e4567-e89b-12d3-a456-426614174000", name: "  " });
    expect(result.success).toBe(false);
  });

  it("accepts a valid rename payload", () => {
    const result = stageSchema.safeParse({ id: "123e4567-e89b-12d3-a456-426614174000", name: "Negociando" });
    expect(result.success).toBe(true);
  });
});
