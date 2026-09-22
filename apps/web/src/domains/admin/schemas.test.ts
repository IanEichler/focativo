import { describe, expect, it } from "vitest";
import { createTenantSchema, setModuleFlagSchema } from "./schemas";

describe("createTenantSchema", () => {
  it("accepts a valid payload and defaults the segment", () => {
    const result = createTenantSchema.safeParse({ name: "Loja Nova", ownerEmail: "dona@example.com" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.segment).toBe("general");
  });

  it("rejects a name that is too short", () => {
    const result = createTenantSchema.safeParse({ name: "A", ownerEmail: "dona@example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid segment format", () => {
    const result = createTenantSchema.safeParse({
      name: "Loja Nova",
      segment: "Não Válido",
      ownerEmail: "dona@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid owner email", () => {
    const result = createTenantSchema.safeParse({ name: "Loja Nova", ownerEmail: "não-é-email" });
    expect(result.success).toBe(false);
  });
});

describe("setModuleFlagSchema", () => {
  it("accepts a known module code and coerces enabled from a string", () => {
    const result = setModuleFlagSchema.safeParse({
      tenantId: "123e4567-e89b-12d3-a456-426614174000",
      moduleCode: "whatsapp",
      enabled: "true",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.enabled).toBe(true);
  });

  it("rejects an unknown module code", () => {
    const result = setModuleFlagSchema.safeParse({
      tenantId: "123e4567-e89b-12d3-a456-426614174000",
      moduleCode: "not_a_module",
      enabled: true,
    });
    expect(result.success).toBe(false);
  });
});
