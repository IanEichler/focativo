import { describe, expect, it } from "vitest";
import { customerSchema } from "./schemas";

describe("customerSchema", () => {
  it("allows editing a WhatsApp contact whose phone has not been resolved", () => {
    const result = customerSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Cliente do WhatsApp",
      phone: "",
      whatsapp: "",
      notes: "Observação atualizada",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBeNull();
      expect(result.data.whatsapp).toBeNull();
    }
  });

  it("still rejects an invalid phone when editing", () => {
    expect(
      customerSchema.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        name: "Cliente",
        phone: "123",
      }).success,
    ).toBe(false);
  });

  it("requires the WhatsApp contact", () => {
    const result = customerSchema.safeParse({ name: "Cliente Sem Telefone", email: "cliente@example.com" });
    expect(result.success).toBe(false);
  });

  it("accepts a customer with just name and phone", () => {
    const result = customerSchema.safeParse({ name: "Cliente Telefone", phone: "11988887777" });
    expect(result.success).toBe(true);
  });

  it("strips non-digit characters from phone and whatsapp (accepts a masked input as-is)", () => {
    const result = customerSchema.safeParse({
      name: "Cliente Telefone",
      phone: "(11) 98888-7777",
      whatsapp: "(11) 97777-6666",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe("11977776666");
      expect(result.data.whatsapp).toBe("11977776666");
    }
  });

  it("rejects a phone with too few digits", () => {
    const result = customerSchema.safeParse({ name: "Cliente Telefone Curto", phone: "123" });
    expect(result.success).toBe(false);
  });

  it("uses a legacy phone as the unified WhatsApp contact", () => {
    const result = customerSchema.safeParse({ name: "Cliente Sem WhatsApp", phone: "11988887777" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.whatsapp).toBe("11988887777");
  });

  it("normalizes the __none__ sentinel to null for origin", () => {
    const result = customerSchema.safeParse({ name: "Cliente Sentinela", phone: "11988887777", origin: "__none__" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.origin).toBeNull();
  });

  it("rejects an invalid origin code", () => {
    const result = customerSchema.safeParse({ name: "Cliente Origem", phone: "11988887777", origin: "marte" });
    expect(result.success).toBe(false);
  });
});

it("creates a customer with only the unified WhatsApp field, preserving the country code", () => {
  const result = customerSchema.parse({ name: "Ian", whatsapp: "+55 (66) 9212-4334" });
  expect(result.whatsapp).toBe("556692124334");
  expect(result.phone).toBe(result.whatsapp);
});
