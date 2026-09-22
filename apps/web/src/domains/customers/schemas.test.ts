import { describe, expect, it } from "vitest";
import { customerSchema } from "./schemas";

describe("customerSchema", () => {
  it("requires at least one contact method", () => {
    const result = customerSchema.safeParse({ name: "Cliente Sem Contato" });
    expect(result.success).toBe(false);
  });

  it("accepts a customer with only email as contact", () => {
    const result = customerSchema.safeParse({ name: "Cliente Email", email: "cliente@example.com" });
    expect(result.success).toBe(true);
  });

  it("strips non-digit characters from phone and whatsapp", () => {
    const result = customerSchema.safeParse({ name: "Cliente Telefone", phone: "(11) 98888-7777" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("11988887777");
  });

  it("rejects a phone with too few digits", () => {
    const result = customerSchema.safeParse({ name: "Cliente Telefone Curto", phone: "123" });
    expect(result.success).toBe(false);
  });

  it("normalizes the __none__ sentinel to null for origin and responsibleUserId", () => {
    const result = customerSchema.safeParse({
      name: "Cliente Sentinela",
      email: "cliente@example.com",
      origin: "__none__",
      responsibleUserId: "__none__",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.origin).toBeNull();
      expect(result.data.responsibleUserId).toBeNull();
    }
  });

  it("rejects an invalid origin code", () => {
    const result = customerSchema.safeParse({ name: "Cliente Origem", email: "cliente@example.com", origin: "marte" });
    expect(result.success).toBe(false);
  });
});
