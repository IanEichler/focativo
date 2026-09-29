import { beforeAll, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";

const db = useTestDatabase();
let tenantId: string;
let ownerId: string;
beforeAll(async () => { ({ tenantId, ownerId } = await db.createTenantWithOwner("Search context")); });
async function context(user = ownerId, preferred: string | null = null) {
  const [row] = await db.as(user).rpc<{ get_my_app_context: {
    activeId: string; memberships: { id: string }[]; permissions: string[];
    disabledModules: string[]; profile: { fullName: string };
  } | null }>("get_my_app_context", { p_preferred_tenant: preferred });
  return row!.get_my_app_context;
}
it("returns the same effective permissions with profile and memberships in one call", async () => {
  const result = await context();
  const permissions = await db.as(ownerId).rpc<{ get_my_permissions: string }>("get_my_permissions", { p_tenant_id: tenantId });
  expect(result?.activeId).toBe(tenantId);
  expect(result?.profile.fullName).toBe("Owner");
  expect(result?.permissions.sort()).toEqual(permissions.map((r) => r.get_my_permissions).sort());
});
it("ignores a forged tenant preference and never exposes another company's membership", async () => {
  const other = await db.createTenantWithOwner("Foreign");
  const result = await context(ownerId, other.tenantId);
  expect(result?.activeId).toBe(tenantId);
  expect(result?.memberships.map((m) => m.id)).not.toContain(other.tenantId);
});
it("uses a permitted preferred company and reads module changes immediately", async () => {
  const [second] = await db.as(ownerId).rpc<{ create_tenant: string }>("create_tenant", { p_name: "Second" });
  const id = second!.create_tenant;
  await db.admin.query("insert into tenant_module_flags(tenant_id,module_code,enabled) values($1,'documents',false) on conflict (tenant_id,module_code) do update set enabled=false", [id]);
  expect((await context(ownerId, id))?.disabledModules).toContain("documents");
  await db.admin.query("update tenant_module_flags set enabled=true where tenant_id=$1 and module_code='documents'", [id]);
  expect((await context(ownerId, id))?.disabledModules).not.toContain("documents");
  expect((await context(ownerId, id))?.activeId).toBe(id);
});
it("does not reuse revoked memberships", async () => {
  const user = await db.addActiveMember(tenantId, "VENDEDOR");
  expect((await context(user))?.activeId).toBe(tenantId);
  await db.admin.query("delete from tenant_users where tenant_id=$1 and user_id=$2", [tenantId, user]);
  expect(await context(user)).toBeNull();
});
it("does not expose the context to anonymous callers", async () => {
  await expect(db.anon.rpc("get_my_app_context")).rejects.toThrow("permission denied");
});
