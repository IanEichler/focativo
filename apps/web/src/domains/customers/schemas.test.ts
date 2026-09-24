import { describe, expect, it } from "vitest";
import { customerSchema } from "./schemas";

describe("customerSchema", () => {
  it("requires a phone", () => {
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
      expect(result.data.phone).toBe("11988887777");
      expect(result.data.whatsapp).toBe("11977776666");
    }
  });

  it("rejects a phone with too few digits", () => {
    const result = customerSchema.safeParse({ name: "Cliente Telefone Curto", phone: "123" });
    expect(result.success).toBe(false);
  });

  it("whatsapp stays optional even though phone is required", () => {
    const result = customerSchema.safeParse({ name: "Cliente Sem WhatsApp", phone: "11988887777" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.whatsapp).toBeNull();
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
