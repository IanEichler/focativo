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

  describe("admin_create_tenant", () => {
    it("tenant owners cannot create a tenant on behalf of someone else", async () => {
      await expectDbError(
        db.as(gorila.ownerId).rpc("admin_create_tenant", {
          p_name: "Empresa Indevida",
          p_segment: "general",
          p_owner_email: "root@platform.test",
        }),
        "forbidden",
      );
    });

    it("rejects an owner email with no matching account", async () => {
      await expectDbError(
        db.as(superAdminId).rpc("admin_create_tenant", {
          p_name: "Empresa Fantasma",
          p_segment: "general",
          p_owner_email: "ninguem@example.com",
        }),
        "user_not_found",
      );
    });

    it("creates the tenant with the designated owner already ACTIVE, and logs the platform audit", async () => {
      const founder = await db.createUser({ email: "fundadora@example.com" });
      const [row] = await db.as(superAdminId).rpc<{ admin_create_tenant: string }>("admin_create_tenant", {
        p_name: "Nova Loja Criada Pelo Admin",
        p_segment: "general",
        p_owner_email: "fundadora@example.com",
      });
      const tenantId = row!.admin_create_tenant;
      expect(tenantId).toBeTruthy();

      const [membership] = await db.admin.query<{ role_code: string; status: string }>(
        "select role_code, status from public.tenant_users where tenant_id = $1 and user_id = $2",
        [tenantId, founder],
      );
      expect(membership).toMatchObject({ role_code: "OWNER", status: "ACTIVE" });

      // O dono já consegue entrar no tenant imediatamente, sem etapa de aceitar convite.
      const ownContext = await db
        .as(founder)
        .query<{ id: string }>("select id from public.tenants where id = $1", [tenantId]);
      expect(ownContext).toHaveLength(1);

      const [audit] = await db
        .as(superAdminId)
        .query<{ action: string }>("select action from public.platform_audit_logs where target_tenant_id = $1", [
          tenantId,
        ]);
      expect(audit!.action).toBe("tenant.created_by_admin");
    });
  });

  describe("tenant_module_flags", () => {
    it("modules are enabled by default (no row = enabled) except what business_type seeds on creation", async () => {
      // Gorila é RETAIL (padrão): só o módulo 'agenda' vem desligado de fábrica.
      const rows = await db
        .as(superAdminId)
        .rpc<{ module_code: string; enabled: boolean }>("admin_list_module_flags", { p_tenant_id: gorila.tenantId });
      expect(rows).toEqual([expect.objectContaining({ module_code: "agenda", enabled: false })]);
    });

    it("non-admins cannot list or change module flags", async () => {
      await expectDbError(
        db.as(gorila.ownerId).rpc("admin_list_module_flags", { p_tenant_id: gorila.tenantId }),
        "forbidden",
      );
      await expectDbError(
        db
          .as(gorila.ownerId)
          .rpc("admin_set_module_flag", { p_tenant_id: gorila.tenantId, p_module_code: "ai", p_enabled: false }),
        "forbidden",
      );
    });

    it("the admin master can disable a module, and toggling it back on is the same call", async () => {
      await db
        .as(superAdminId)
        .rpc("admin_set_module_flag", { p_tenant_id: gorila.tenantId, p_module_code: "whatsapp", p_enabled: false });

      let rows = await db
        .as(superAdminId)
        .rpc<{ module_code: string; enabled: boolean }>("admin_list_module_flags", { p_tenant_id: gorila.tenantId });
      expect(rows).toEqual(
        expect.arrayContaining([expect.objectContaining({ module_code: "whatsapp", enabled: false })]),
      );

      await db
        .as(superAdminId)
        .rpc("admin_set_module_flag", { p_tenant_id: gorila.tenantId, p_module_code: "whatsapp", p_enabled: true });
      rows = await db
        .as(superAdminId)
        .rpc<{ module_code: string; enabled: boolean }>("admin_list_module_flags", { p_tenant_id: gorila.tenantId });
      expect(rows).toEqual(
        expect.arrayContaining([expect.objectContaining({ module_code: "whatsapp", enabled: true })]),
      );
    });

    it("a tenant member can read their own tenant's flags but not another tenant's", async () => {
      await db
        .as(superAdminId)
        .rpc("admin_set_module_flag", { p_tenant_id: gorila.tenantId, p_module_code: "ai", p_enabled: false });

      const own = await db
        .as(gorila.ownerId)
        .query<{ module_code: string }>("select module_code from public.tenant_module_flags where tenant_id = $1", [
          gorila.tenantId,
        ]);
      expect(own.map((r) => r.module_code)).toContain("ai");

      const other = await db.createTenantWithOwner("Outra Loja Módulos");
      const cannotSee = await db
        .as(other.ownerId)
        .query("select module_code from public.tenant_module_flags where tenant_id = $1", [gorila.tenantId]);
      expect(cannotSee).toHaveLength(0);
    });
  });

  describe("admin_log_password_reset", () => {
    it("non-admins cannot log a password reset", async () => {
      await expectDbError(
        db.as(gorila.ownerId).rpc("admin_log_password_reset", { p_target_user_id: gorila.ownerId }),
        "forbidden",
      );
    });

    it("super admin can log it, and it shows up in the platform audit trail", async () => {
      await db
        .as(superAdminId)
        .rpc("admin_log_password_reset", { p_target_user_id: gorila.ownerId, p_tenant_id: gorila.tenantId });

      const [event] = await db
        .as(superAdminId)
        .query<{ action: string; entity_id: string }>(
          "select action, entity_id from public.platform_audit_logs where target_tenant_id = $1 and action = 'user.password_reset_by_admin'",
          [gorila.tenantId],
        );
      expect(event!.entity_id).toBe(gorila.ownerId);
    });
  });

  describe("admin manages users inside any tenant", () => {
    // Tenant próprio (não o `gorila` compartilhado, que um teste acima deixa
    // SUSPENDED de propósito) — aqui precisamos de um tenant ACTIVE de verdade.
    async function freshTenant(name: string) {
      return db.createTenantWithOwner(name);
    }

    it("non-admins cannot call the admin user-management RPCs", async () => {
      const tenant = await freshTenant("Loja Admin RPCs");
      await expectDbError(
        db.as(tenant.ownerId).rpc("admin_invite_tenant_user", {
          p_tenant_id: tenant.tenantId,
          p_email: "x@x.test",
          p_role_code: "VENDEDOR",
        }),
        "forbidden",
      );
      await expectDbError(
        db.as(tenant.ownerId).rpc("admin_remove_tenant_user", { p_membership_id: tenant.ownerId }),
        "forbidden",
      );
      await expectDbError(
        db
          .as(tenant.ownerId)
          .rpc("admin_set_tenant_user_permissions", { p_membership_id: tenant.ownerId, p_overrides: "[]" }),
        "forbidden",
      );
      await expectDbError(
        db.as(tenant.ownerId).rpc("admin_list_tenant_user_permissions", { p_membership_id: tenant.ownerId }),
        "forbidden",
      );
    });

    it("super admin creates a membership directly, without being a member itself", async () => {
      const tenant = await freshTenant("Loja Admin Criação");
      const targetId = await db.createUser({ email: "novo@gorila.test" });
      const [row] = await db.as(superAdminId).rpc<{ admin_invite_tenant_user: string }>("admin_invite_tenant_user", {
        p_tenant_id: tenant.tenantId,
        p_email: "NOVO@gorila.test",
        p_role_code: "ADMIN",
      });
      const membershipId = row!.admin_invite_tenant_user;
      expect(membershipId).toBeTruthy();

      const [member] = await db.admin.query<{ role_code: string; status: string }>(
        "select role_code, status from public.tenant_users where id = $1",
        [membershipId],
      );
      expect(member).toMatchObject({ role_code: "ADMIN", status: "INVITED" });

      await db.as(targetId).rpc("accept_tenant_invitation", { p_tenant_id: tenant.tenantId });
      expect(await db.as(targetId).query("select id from public.tenants")).toHaveLength(1);
    });

    it("p_active=true creates the membership already ACTIVE — used for accounts created with a password", async () => {
      const tenant = await freshTenant("Loja Admin Criação Ativa");
      const targetId = await db.createUser({ email: "direto@gorila.test" });
      await db.as(superAdminId).rpc("admin_invite_tenant_user", {
        p_tenant_id: tenant.tenantId,
        p_email: "direto@gorila.test",
        p_role_code: "VENDEDOR",
        p_active: true,
      });

      const [member] = await db.admin.query<{ role_code: string; status: string }>(
        "select role_code, status from public.tenant_users where tenant_id = $1 and user_id = $2",
        [tenant.tenantId, targetId],
      );
      expect(member).toMatchObject({ role_code: "VENDEDOR", status: "ACTIVE" });
      expect(await db.as(targetId).query("select id from public.tenants")).toHaveLength(1);
    });

    it("rejects an unknown email or role", async () => {
      const tenant = await freshTenant("Loja Admin Rejeição");
      await expectDbError(
        db.as(superAdminId).rpc("admin_invite_tenant_user", {
          p_tenant_id: tenant.tenantId,
          p_email: "ninguem@x.test",
          p_role_code: "VENDEDOR",
        }),
        "user_not_found",
      );
      await db.createUser({ email: "algum@gorila.test" });
      await expectDbError(
        db.as(superAdminId).rpc("admin_invite_tenant_user", {
          p_tenant_id: tenant.tenantId,
          p_email: "algum@gorila.test",
          p_role_code: "NOT_A_ROLE",
        }),
        "invalid_role",
      );
    });

    it("removes a membership and keeps the last-owner protection", async () => {
      const tenant = await freshTenant("Loja Admin Remoção");
      const sellerId = await db.addActiveMember(tenant.tenantId, "VENDEDOR");
      const [seller] = await db.admin.query<{ id: string }>(
        "select id from public.tenant_users where tenant_id = $1 and user_id = $2",
        [tenant.tenantId, sellerId],
      );
      await db.as(superAdminId).rpc("admin_remove_tenant_user", { p_membership_id: seller!.id });
      expect(await db.admin.query("select id from public.tenant_users where id = $1", [seller!.id])).toHaveLength(0);

      const [owner] = await db.admin.query<{ id: string }>(
        "select id from public.tenant_users where tenant_id = $1 and user_id = $2",
        [tenant.tenantId, tenant.ownerId],
      );
      await expectDbError(
        db.as(superAdminId).rpc("admin_remove_tenant_user", { p_membership_id: owner!.id }),
        "last_owner",
      );
    });

    it("sets and lists permission overrides on behalf of the tenant", async () => {
      const tenant = await freshTenant("Loja Admin Permissões");
      const managerId = await db.addActiveMember(tenant.tenantId, "GERENTE");
      const [manager] = await db.admin.query<{ id: string }>(
        "select id from public.tenant_users where tenant_id = $1 and user_id = $2",
        [tenant.tenantId, managerId],
      );

      await db.as(superAdminId).rpc("admin_set_tenant_user_permissions", {
        p_membership_id: manager!.id,
        p_overrides: JSON.stringify([{ code: "tenant.update", granted: true }]),
      });

      const rows = await db
        .as(superAdminId)
        .rpc<{ permission_code: string; granted: boolean; is_override: boolean }>(
          "admin_list_tenant_user_permissions",
          { p_membership_id: manager!.id },
        );
      expect(rows).toContainEqual(
        expect.objectContaining({ permission_code: "tenant.update", granted: true, is_override: true }),
      );

      const [check] = await db
        .as(managerId)
        .query<{ has: boolean }>("select private.has_tenant_permission($1, 'tenant.update') as has", [tenant.tenantId]);
      expect(check!.has).toBe(true);
    });
  });
});
