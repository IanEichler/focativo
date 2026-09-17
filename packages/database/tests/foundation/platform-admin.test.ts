import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useTestDatabase } from "../../src/harness/test-db";

describe("platform super admin", () => {
  const db = useTestDatabase();
  let superAdminId: string;
  let gorila: { tenantId: string; ownerId: string };

  beforeAll(async () => {
    superAdminId = await db.createUser({ email: "root@platform.test" });
    await db.makeSuperAdmin(superAdminId);
    gorila = await db.createTenantWithOwner("Gorila Suplementos");
    await db.createTenantWithOwner("Loja B");
  });

  it("tenant owners cannot call admin RPCs", async () => {
    await expectDbError(db.as(gorila.ownerId).rpc("admin_platform_overview"), "forbidden");
    await expectDbError(
      db.as(gorila.ownerId).rpc("admin_set_tenant_status", {
        p_tenant_id: gorila.tenantId,
        p_status: "SUSPENDED",
        p_reason: "tentativa indevida",
      }),
      "forbidden",
    );
    await expectDbError(db.as(gorila.ownerId).rpc("admin_list_tenants"), "forbidden");
  });

  it("super admin gets platform overview", async () => {
    const [row] = await db
      .as(superAdminId)
      .rpc<{ admin_platform_overview: { tenants: { total: number; active: number } } }>("admin_platform_overview");
    expect(row!.admin_platform_overview.tenants).toMatchObject({ total: 2, active: 2 });
  });

  it("super admin lists tenants with owner and counts", async () => {
    const rows = await db
      .as(superAdminId)
      .rpc<{ name: string; owner_name: string; active_users: string; total_count: string }>("admin_list_tenants", {
        p_search: "gorila",
      });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Gorila Suplementos",
      owner_name: "Owner",
      active_users: "1",
      total_count: "1",
    });
  });

  it("super admin sees platform tables but not tenant audit logs", async () => {
    const tenants = await db.as(superAdminId).query("select id from public.tenants");
    expect(tenants).toHaveLength(2);
    const logs = await db.as(superAdminId).query("select id from public.audit_logs");
    expect(logs).toHaveLength(0);
  });

  it("status change requires a reason and is audited on both trails", async () => {
    await expectDbError(
      db
        .as(superAdminId)
        .rpc("admin_set_tenant_status", { p_tenant_id: gorila.tenantId, p_status: "SUSPENDED", p_reason: "" }),
      "invalid_input",
    );

    await db.as(superAdminId).rpc("admin_set_tenant_status", {
      p_tenant_id: gorila.tenantId,
      p_status: "SUSPENDED",
      p_reason: "Inadimplência confirmada",
    });

    const platform = await db
      .as(superAdminId)
      .query<{ reason: string; before: unknown; after: unknown; actor_user_id: string }>(
        "select reason, before, after, actor_user_id from public.platform_audit_logs where target_tenant_id = $1",
        [gorila.tenantId],
      );
    expect(platform).toEqual([
      {
        reason: "Inadimplência confirmada",
        before: { status: "ACTIVE" },
        after: { status: "SUSPENDED" },
        actor_user_id: superAdminId,
      },
    ]);

    const tenantAudit = await db.admin.query<{ actor_type: string }>(
      "select actor_type from public.audit_logs where tenant_id = $1 and action = 'tenant.updated'",
      [gorila.tenantId],
    );
    expect(tenantAudit).toEqual([{ actor_type: "PLATFORM_ADMIN" }]);

    // Owner não enxerga a trilha da plataforma
    expect(await db.as(gorila.ownerId).query("select id from public.platform_audit_logs")).toHaveLength(0);
  });
});
