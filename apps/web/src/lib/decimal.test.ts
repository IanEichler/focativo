import { describe, expect, it } from "vitest";
import { z } from "zod";
import { optionalDecimal, optionalUuid, parseDecimalBR, requiredDecimal, toDecimalInput } from "./decimal";

describe("parseDecimalBR", () => {
  it.each([
    ["139,90", 139.9],
    ["1.234,56", 1234.56],
    ["139.90", 139.9],
    ["1.500", 1500],
    ["R$ 12,5", 12.5],
    ["0", 0],
    ["  42 ", 42],
  ])("parses %s", (input, expected) => {
    expect(parseDecimalBR(input)).toBe(expected);
  });

  it("returns null for empty and NaN for garbage", () => {
    expect(parseDecimalBR("")).toBeNull();
    expect(parseDecimalBR(undefined)).toBeNull();
    expect(parseDecimalBR("12a")).toBeNaN();
    expect(parseDecimalBR("1,2,3")).toBeNaN();
  });
});

describe("decimal schemas", () => {
  const money = optionalDecimal({ label: "Preço", scale: 2 });
  const quantity = requiredDecimal({ label: "Quantidade", min: 0, exclusiveMin: true, scale: 3 });

  it("validates scale, minimum and required", () => {
    expect(money.parse("10,99")).toBe(10.99);
    expect(money.parse("")).toBeNull();
    expect(money.safeParse("10,999").success).toBe(false);
    expect(money.safeParse("-1").success).toBe(false);
    expect(quantity.parse("0,125")).toBe(0.125);
    expect(quantity.safeParse("0").success).toBe(false);
    expect(quantity.safeParse("").success).toBe(false);
  });

  it("formats values back for inputs", () => {
    expect(toDecimalInput(139.9)).toBe("139,90");
    expect(toDecimalInput(5, 3)).toBe("5");
    expect(toDecimalInput(2.5, 3)).toBe("2,5");
    expect(toDecimalInput(null)).toBe("");
  });

  it("treats select sentinels as empty and rejects invalid ids", () => {
    const schema = z.object({ id: optionalUuid });
    expect(schema.parse({ id: "__none__" }).id).toBeNull();
    expect(schema.parse({ id: "__new__" }).id).toBeNull();
    expect(schema.safeParse({ id: "abc" }).success).toBe(false);
  });
});
