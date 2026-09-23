import { describe, expect, it } from "vitest";
import { aiPlatformLimitsSchema, createTenantSchema, setModuleFlagSchema } from "./schemas";

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

describe("aiPlatformLimitsSchema", () => {
  const base = {
    tenantId: "123e4567-e89b-12d3-a456-426614174000",
    model: "claude-sonnet-5",
    maxTokensPerReply: "1024",
  };

  it("accepts a minimal valid payload", () => {
    const result = aiPlatformLimitsSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.monthlyBudgetUsd).toBeUndefined();
  });

  it("rejects an unknown model", () => {
    const result = aiPlatformLimitsSchema.safeParse({ ...base, model: "gpt-4" });
    expect(result.success).toBe(false);
  });

  it("rejects a max tokens value outside the allowed range", () => {
    const result = aiPlatformLimitsSchema.safeParse({ ...base, maxTokensPerReply: "8192" });
    expect(result.success).toBe(false);
  });

  it("parses a positive monthly budget", () => {
    const result = aiPlatformLimitsSchema.safeParse({ ...base, monthlyBudgetUsd: "25.50" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.monthlyBudgetUsd).toBe(25.5);
  });

  it("rejects a negative monthly budget", () => {
    const result = aiPlatformLimitsSchema.safeParse({ ...base, monthlyBudgetUsd: "-5" });
    expect(result.success).toBe(false);
  });
});
