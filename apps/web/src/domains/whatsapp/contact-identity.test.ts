import { describe, expect, it } from "vitest";
import { contactPhone } from "./contact-identity";

describe("contactPhone", () => {
  it("hides old raw and country-prefixed LIDs even if they look like valid phones", () => {
    expect(contactPhone("12345678901", "12345678901@lid")).toBeNull();
    expect(contactPhone("5512345678901", "12345678901@lid")).toBeNull();
  });
  it("preserves real international numbers without adding Brazil's country code", () => {
    expect(contactPhone("+1 (415) 555-2671", "12345678901@lid")).toBe("14155552671");
    expect(contactPhone("5511999999999", "5511999999999@c.us")).toBe("5511999999999");
  });
  it("handles an unresolved phone", () => {
    expect(contactPhone(null, "12345678901@lid")).toBeNull();
  });
});
