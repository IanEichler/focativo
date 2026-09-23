import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useTestDatabase } from "../../src/harness/test-db";

describe("IA: limites de plataforma (só admin master) vs. comportamento (tenant)", () => {
  const db = useTestDatabase();
  let superAdminId: string;
  let tenantId: string;
  let ownerId: string;

  beforeAll(async () => {
    superAdminId = await db.createUser({ email: "root-ai-limits@platform.test" });
    await db.makeSuperAdmin(superAdminId);
    const owner = await db.createTenantWithOwner("Clínica Limites");
    tenantId = owner.tenantId;
    ownerId = owner.ownerId;
  });

  it("defaults to claude-sonnet-5/1024 tokens when no row exists yet", async () => {
    const [row] = await db
      .as(superAdminId)
      .rpc<{ model: string; max_tokens_per_reply: number }>("admin_ai_platform_limits_get", {
        p_tenant_id: tenantId,
      });
    expect(row!.model).toBe("claude-sonnet-5");
    expect(row!.max_tokens_per_reply).toBe(1024);
  });

  it("rejects a tenant owner reading or writing platform limits — admin master only", async () => {
    await expectDbError(db.as(ownerId).rpc("admin_ai_platform_limits_get", { p_tenant_id: tenantId }), "forbidden");
    await expectDbError(
      db.as(ownerId).rpc("admin_ai_platform_limits_set", { p_tenant_id: tenantId, p_model: "claude-opus-5" }),
      "forbidden",
    );
  });

  it("super admin sets model, token limit and budget, and they persist", async () => {
    const [row] = await db
      .as(superAdminId)
      .rpc<{ model: string; max_tokens_per_reply: number; monthly_budget_cents: number | null }>(
        "admin_ai_platform_limits_set",
        { p_tenant_id: tenantId, p_model: "claude-opus-5", p_max_tokens_per_reply: 2048, p_monthly_budget_cents: 5000 },
      );
    expect(row!.model).toBe("claude-opus-5");
    expect(row!.max_tokens_per_reply).toBe(2048);
    expect(row!.monthly_budget_cents).toBe(5000);

    const [fetched] = await db
      .as(superAdminId)
      .rpc<{ model: string }>("admin_ai_platform_limits_get", { p_tenant_id: tenantId });
    expect(fetched!.model).toBe("claude-opus-5");
  });

  it("ai_settings_get/update never return model, tokens or budget anymore — that's the admin master's table now", async () => {
    const [updated] = await db.as(ownerId).rpc<Record<string, unknown>>("ai_settings_update", {
      p_tenant_id: tenantId,
      p_enabled: true,
      p_system_prompt: "Fale sempre em português.",
    });
    expect(updated).not.toHaveProperty("model");
    expect(updated).not.toHaveProperty("max_tokens_per_reply");
    expect(updated).not.toHaveProperty("monthly_budget_cents");

    const [fetched] = await db.as(ownerId).rpc<Record<string, unknown>>("ai_settings_get", { p_tenant_id: tenantId });
    expect(fetched).not.toHaveProperty("model");
  });
});
