import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useTestDatabase } from "../../src/harness/test-db";

type Membership = { id: string; role_code: string; status: string };

describe("tenant creation, invitations and RBAC", () => {
  const db = useTestDatabase();

  async function membership(tenantId: string, userId: string): Promise<Membership | undefined> {
    const rows = await db.admin.query<Membership>(
      "select id, role_code, status from public.tenant_users where tenant_id = $1 and user_id = $2",
      [tenantId, userId],
    );
    return rows[0];
  }

  describe("create_tenant", () => {
    it("creates the tenant, OWNER membership and audit entry", async () => {
      const ownerId = await db.createUser();
      const [row] = await db.as(ownerId).rpc<{ create_tenant: string }>("create_tenant", {
        p_name: "Gorila Suplementos",
        p_segment: "supplements",
      });
      const tenantId = row!.create_tenant;

      const tenant = await db
        .as(ownerId)
        .query<{ slug: string; segment: string; created_by: string }>(
          "select slug, segment, created_by from public.tenants where id = $1",
          [tenantId],
        );
      expect(tenant[0]).toEqual({ slug: "gorila-suplementos", segment: "supplements", created_by: ownerId });
      expect(await membership(tenantId, ownerId)).toMatchObject({ role_code: "OWNER", status: "ACTIVE" });

      const audit = await db
        .as(ownerId)
        .query("select id from public.audit_logs where action = 'tenant.created' and tenant_id = $1", [tenantId]);
      expect(audit).toHaveLength(1);
    });

    it("generates unique slugs and handles accents", async () => {
      const u1 = await db.createUser();
      const u2 = await db.createUser();
      const [first] = await db.as(u1).rpc<{ create_tenant: string }>("create_tenant", { p_name: "Açaí & Nutrição" });
      const [second] = await db.as(u2).rpc<{ create_tenant: string }>("create_tenant", { p_name: "Açaí & Nutrição" });
      const slugs = await db.admin.query<{ slug: string }>(
        "select slug from public.tenants where id = any($1::uuid[]) order by created_at",
        [[first!.create_tenant, second!.create_tenant]],
      );
      expect(slugs[0]!.slug).toBe("acai-nutricao");
      expect(slugs[1]!.slug).toMatch(/^acai-nutricao-[0-9a-f]{6}$/);
    });

    it("rejects invalid names and anonymous callers", async () => {
      const userId = await db.createUser();
      await expectDbError(db.as(userId).rpc("create_tenant", { p_name: " a " }), "invalid_input");
      await expectDbError(db.anon.rpc("create_tenant", { p_name: "Loja" }), /permission denied/);
    });
  });

  describe("invitations", () => {
    let tenantId: string;
    let ownerId: string;

    beforeAll(async () => {
      ({ tenantId, ownerId } = await db.createTenantWithOwner("Loja Convites"));
    });

    it("invited user has no access until accepting", async () => {
      const inviteeId = await db.createUser({ email: "vendedor@loja.test" });
      await db.as(ownerId).rpc("invite_tenant_user", {
        p_tenant_id: tenantId,
        p_email: "VENDEDOR@loja.test",
        p_role_code: "VENDEDOR",
      });

      expect(await membership(tenantId, inviteeId)).toMatchObject({ status: "INVITED", role_code: "VENDEDOR" });
      expect(await db.as(inviteeId).query("select id from public.tenants")).toHaveLength(0);

      const invitations = await db.as(inviteeId).rpc<{ tenant_name: string; role_code: string }>("list_my_invitations");
      expect(invitations).toEqual([expect.objectContaining({ tenant_name: "Loja Convites", role_code: "VENDEDOR" })]);

      await db.as(inviteeId).rpc("accept_tenant_invitation", { p_tenant_id: tenantId });
      expect(await membership(tenantId, inviteeId)).toMatchObject({ status: "ACTIVE" });
      expect(await db.as(inviteeId).query("select id from public.tenants")).toHaveLength(1);
    });

    it("declining removes the invitation", async () => {
      const inviteeId = await db.createUser({ email: "recusa@loja.test" });
      await db
        .as(ownerId)
        .rpc("invite_tenant_user", { p_tenant_id: tenantId, p_email: "recusa@loja.test", p_role_code: "GERENTE" });
      await db.as(inviteeId).rpc("decline_tenant_invitation", { p_tenant_id: tenantId });
      expect(await membership(tenantId, inviteeId)).toBeUndefined();
      await expectDbError(db.as(inviteeId).rpc("accept_tenant_invitation", { p_tenant_id: tenantId }), "not_found");
    });

    it("rejects unknown emails and duplicate members", async () => {
      await expectDbError(
        db
          .as(ownerId)
          .rpc("invite_tenant_user", { p_tenant_id: tenantId, p_email: "ninguem@x.test", p_role_code: "VENDEDOR" }),
        "user_not_found",
      );
      const memberId = await db.addActiveMember(tenantId, "VENDEDOR", "dup@loja.test");
      expect(memberId).toBeTruthy();
      await expectDbError(
        db
          .as(ownerId)
          .rpc("invite_tenant_user", { p_tenant_id: tenantId, p_email: "dup@loja.test", p_role_code: "GERENTE" }),
        "already_member",
      );
    });

    it("enforces role hierarchy for inviters", async () => {
      const adminId = await db.addActiveMember(tenantId, "ADMIN");
      const managerId = await db.addActiveMember(tenantId, "GERENTE");
      const sellerId = await db.addActiveMember(tenantId, "VENDEDOR");
      await db.createUser({ email: "alvo@loja.test" });

      await expectDbError(
        db
          .as(adminId)
          .rpc("invite_tenant_user", { p_tenant_id: tenantId, p_email: "alvo@loja.test", p_role_code: "ADMIN" }),
        "role_hierarchy",
      );
      await expectDbError(
        db
          .as(managerId)
          .rpc("invite_tenant_user", { p_tenant_id: tenantId, p_email: "alvo@loja.test", p_role_code: "VENDEDOR" }),
        "forbidden",
      );
      await expectDbError(
        db
          .as(sellerId)
          .rpc("invite_tenant_user", { p_tenant_id: tenantId, p_email: "alvo@loja.test", p_role_code: "VENDEDOR" }),
        "forbidden",
      );
      await db
        .as(adminId)
        .rpc("invite_tenant_user", { p_tenant_id: tenantId, p_email: "alvo@loja.test", p_role_code: "GERENTE" });
    });

    it("cannot invite into another tenant", async () => {
      const other = await db.createTenantWithOwner("Outra Loja");
      await db.createUser({ email: "cross@loja.test" });
      await expectDbError(
        db
          .as(other.ownerId)
          .rpc("invite_tenant_user", { p_tenant_id: tenantId, p_email: "cross@loja.test", p_role_code: "VENDEDOR" }),
        "forbidden",
      );
    });
  });

  describe("member management", () => {
    it("lists assignable roles according to hierarchy", async () => {
      const { tenantId, ownerId } = await db.createTenantWithOwner("Loja Papéis");
      const adminId = await db.addActiveMember(tenantId, "ADMIN");
      const sellerId = await db.addActiveMember(tenantId, "VENDEDOR");

      const ownerRoles = await db.as(ownerId).rpc<{ code: string }>("list_assignable_roles", { p_tenant_id: tenantId });
      expect(ownerRoles.map((r) => r.code)).toEqual(["OWNER", "ADMIN", "GERENTE", "VENDEDOR"]);
      const adminRoles = await db.as(adminId).rpc<{ code: string }>("list_assignable_roles", { p_tenant_id: tenantId });
      expect(adminRoles.map((r) => r.code)).toEqual(["GERENTE", "VENDEDOR"]);
      const sellerRoles = await db.as(sellerId).rpc("list_assignable_roles", { p_tenant_id: tenantId });
      expect(sellerRoles).toEqual([]);
    });

    it("returns permissions per role", async () => {
      const { tenantId, ownerId } = await db.createTenantWithOwner("Loja Permissões");
      const managerId = await db.addActiveMember(tenantId, "GERENTE");
      const sellerId = await db.addActiveMember(tenantId, "VENDEDOR");

      const owner = await db
        .as(ownerId)
        .rpc<{ get_my_permissions: string }>("get_my_permissions", { p_tenant_id: tenantId });
      expect(owner.map((r) => r.get_my_permissions)).toEqual(
        expect.arrayContaining(["tenant.update", "users.invite", "users.manage", "audit.read"]),
      );
      const manager = await db
        .as(managerId)
        .rpc<{ get_my_permissions: string }>("get_my_permissions", { p_tenant_id: tenantId });
      const managerPermissions = manager.map((r) => r.get_my_permissions);
      expect(managerPermissions).toEqual(expect.arrayContaining(["users.read", "catalog.write", "inventory.adjust"]));
      expect(managerPermissions).not.toContain("users.invite");
      expect(managerPermissions).not.toContain("users.manage");
      expect(managerPermissions).not.toContain("tenant.update");

      const seller = await db
        .as(sellerId)
        .rpc<{ get_my_permissions: string }>("get_my_permissions", { p_tenant_id: tenantId });
      expect(seller.map((r) => r.get_my_permissions)).toEqual(["catalog.read", "inventory.read"]);
    });

    it("changes roles respecting hierarchy and self-protection", async () => {
      const { tenantId, ownerId } = await db.createTenantWithOwner("Loja Hierarquia");
      const adminId = await db.addActiveMember(tenantId, "ADMIN");
      const sellerId = await db.addActiveMember(tenantId, "VENDEDOR");
      const seller = (await membership(tenantId, sellerId))!;
      const owner = (await membership(tenantId, ownerId))!;
      const admin = (await membership(tenantId, adminId))!;

      await db.as(adminId).rpc("update_tenant_user_role", { p_membership_id: seller.id, p_role_code: "GERENTE" });
      expect(await membership(tenantId, sellerId)).toMatchObject({ role_code: "GERENTE" });

      await expectDbError(
        db.as(adminId).rpc("update_tenant_user_role", { p_membership_id: owner.id, p_role_code: "VENDEDOR" }),
        "role_hierarchy",
      );
      await expectDbError(
        db.as(adminId).rpc("update_tenant_user_role", { p_membership_id: admin.id, p_role_code: "OWNER" }),
        "cannot_modify_self",
      );
      await expectDbError(
        db.as(ownerId).rpc("update_tenant_user_role", { p_membership_id: owner.id, p_role_code: "ADMIN" }),
        "cannot_modify_self",
      );

      const audit = await db
        .as(ownerId)
        .query<{ before: unknown; after: unknown }>(
          "select before, after from public.audit_logs where tenant_id = $1 and action = 'tenant_user.role_changed'",
          [tenantId],
        );
      expect(audit).toEqual([{ before: { role_code: "VENDEDOR" }, after: { role_code: "GERENTE" } }]);
    });

    it("disabling a member revokes access; enabling restores it", async () => {
      const { tenantId, ownerId } = await db.createTenantWithOwner("Loja Status");
      const sellerId = await db.addActiveMember(tenantId, "VENDEDOR");
      const seller = (await membership(tenantId, sellerId))!;

      await db.as(ownerId).rpc("set_tenant_user_status", { p_membership_id: seller.id, p_active: false });
      expect(await db.as(sellerId).query("select id from public.tenants")).toHaveLength(0);

      await db.as(ownerId).rpc("set_tenant_user_status", { p_membership_id: seller.id, p_active: true });
      expect(await db.as(sellerId).query("select id from public.tenants")).toHaveLength(1);
    });

    it("removes members and blocks outsiders from managing", async () => {
      const { tenantId, ownerId } = await db.createTenantWithOwner("Loja Remoção");
      const sellerId = await db.addActiveMember(tenantId, "VENDEDOR");
      const seller = (await membership(tenantId, sellerId))!;
      const outsider = await db.createTenantWithOwner("Intrusa");

      await expectDbError(
        db.as(outsider.ownerId).rpc("remove_tenant_user", { p_membership_id: seller.id }),
        "forbidden",
      );
      await db.as(ownerId).rpc("remove_tenant_user", { p_membership_id: seller.id });
      expect(await membership(tenantId, sellerId)).toBeUndefined();
    });

    it("concurrent owners demoting each other always leave one active owner", async () => {
      for (let round = 0; round < 5; round++) {
        const { tenantId, ownerId } = await db.createTenantWithOwner(`Loja Corrida ${round}`);
        const secondOwnerId = await db.addActiveMember(tenantId, "OWNER");
        const first = (await membership(tenantId, ownerId))!;
        const second = (await membership(tenantId, secondOwnerId))!;

        const results = await Promise.allSettled([
          db.as(ownerId).rpc("update_tenant_user_role", { p_membership_id: second.id, p_role_code: "ADMIN" }),
          db.as(secondOwnerId).rpc("update_tenant_user_role", { p_membership_id: first.id, p_role_code: "ADMIN" }),
        ]);

        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const owners = await db.admin.query(
          "select id from public.tenant_users where tenant_id = $1 and role_code = 'OWNER' and status = 'ACTIVE'",
          [tenantId],
        );
        expect(owners).toHaveLength(1);
      }
    });
  });
});
