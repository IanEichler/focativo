import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useTestDatabase } from "../../src/harness/test-db";

describe("tenant isolation (RLS)", () => {
  const db = useTestDatabase();
  let a: { tenantId: string; ownerId: string };
  let b: { tenantId: string; ownerId: string };
  let bSeller: string;

  beforeAll(async () => {
    a = await db.createTenantWithOwner("Gorila Suplementos");
    b = await db.createTenantWithOwner("Loja B");
    bSeller = await db.addActiveMember(b.tenantId, "VENDEDOR");
  });

  it("user only sees tenants where they are an active member", async () => {
    const rows = await db.as(a.ownerId).query<{ id: string }>("select id from public.tenants");
    expect(rows.map((r) => r.id)).toEqual([a.tenantId]);
  });

  it("user cannot read memberships of another tenant", async () => {
    const rows = await db.as(a.ownerId).query("select id from public.tenant_users where tenant_id = $1", [b.tenantId]);
    expect(rows).toHaveLength(0);
  });

  it("user cannot read profiles of members from another tenant", async () => {
    const rows = await db.as(a.ownerId).query("select id from public.profiles where id = $1", [bSeller]);
    expect(rows).toHaveLength(0);
  });

  it("user cannot update another tenant even with a forged tenant id", async () => {
    const rows = await db
      .as(a.ownerId)
      .query("update public.tenants set name = 'hacked' where id = $1 returning id", [b.tenantId]);
    expect(rows).toHaveLength(0);
    const check = await db.admin.query<{ name: string }>("select name from public.tenants where id = $1", [b.tenantId]);
    expect(check[0]!.name).toBe("Loja B");
  });

  it("user cannot read audit logs of another tenant", async () => {
    const rows = await db.as(a.ownerId).query("select id from public.audit_logs where tenant_id = $1", [b.tenantId]);
    expect(rows).toHaveLength(0);
  });

  it("anonymous requests cannot read tenants", async () => {
    await expectDbError(db.anon.query("select id from public.tenants"), /permission denied/);
  });

  it("owner updates own tenant and the change is audited with diff only", async () => {
    await db.as(a.ownerId).query("update public.tenants set legal_name = 'Gorila LTDA' where id = $1", [a.tenantId]);
    const logs = await db
      .as(a.ownerId)
      .query<{ action: string; before: unknown; after: unknown; actor_user_id: string }>(
        "select action, before, after, actor_user_id from public.audit_logs where tenant_id = $1 and action = 'tenant.updated'",
        [a.tenantId],
      );
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      before: { legal_name: null },
      after: { legal_name: "Gorila LTDA" },
      actor_user_id: a.ownerId,
    });
  });

  it("tenant members cannot change tenant status or slug", async () => {
    await expectDbError(
      db.as(a.ownerId).query("update public.tenants set status = 'CANCELED' where id = $1", [a.tenantId]),
      /permission denied/,
    );
    await expectDbError(
      db.as(a.ownerId).query("update public.tenants set slug = 'outro' where id = $1", [a.tenantId]),
      /permission denied/,
    );
  });

  it("seller cannot update tenant settings nor read audit logs", async () => {
    const updated = await db
      .as(bSeller)
      .query("update public.tenants set name = 'x' where id = $1 returning id", [b.tenantId]);
    expect(updated).toHaveLength(0);
    const logs = await db.as(bSeller).query("select id from public.audit_logs where tenant_id = $1", [b.tenantId]);
    expect(logs).toHaveLength(0);
  });

  it("members cannot insert memberships directly", async () => {
    await expectDbError(
      db
        .as(a.ownerId)
        .query(
          "insert into public.tenant_users (tenant_id, user_id, role_code, status, joined_at) values ($1, $2, 'OWNER', 'ACTIVE', now())",
          [b.tenantId, a.ownerId],
        ),
      /permission denied/,
    );
  });

  it("nobody can grant SUPER_ADMIN through the API", async () => {
    await expectDbError(
      db.as(a.ownerId).query("insert into public.platform_admins (user_id) values ($1)", [a.ownerId]),
      /permission denied/,
    );
  });

  it("suspended tenant stays readable but becomes read-only", async () => {
    const tenant = await db.createTenantWithOwner("Loja Suspensa");
    await db.admin.query("update public.tenants set status = 'SUSPENDED' where id = $1", [tenant.tenantId]);

    const visible = await db.as(tenant.ownerId).query("select id from public.tenants where id = $1", [tenant.tenantId]);
    expect(visible).toHaveLength(1);

    const updated = await db
      .as(tenant.ownerId)
      .query("update public.tenants set name = 'Novo nome' where id = $1 returning id", [tenant.tenantId]);
    expect(updated).toHaveLength(0);

    const permissions = await db.as(tenant.ownerId).rpc("get_my_permissions", { p_tenant_id: tenant.tenantId });
    expect(permissions).toHaveLength(0);
  });

  it("canceled tenant becomes invisible to its members", async () => {
    const tenant = await db.createTenantWithOwner("Loja Cancelada");
    await db.admin.query("update public.tenants set status = 'CANCELED' where id = $1", [tenant.tenantId]);
    const rows = await db.as(tenant.ownerId).query("select id from public.tenants where id = $1", [tenant.tenantId]);
    expect(rows).toHaveLength(0);
  });

  it("audit logs are append-only even for privileged roles", async () => {
    await expectDbError(db.admin.query("delete from public.audit_logs"), "append_only");
    await expectDbError(db.admin.query("update public.audit_logs set action = 'x.y'"), "append_only");
  });
});
