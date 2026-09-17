import { describe, expect, it } from "vitest";
import { expectDbError, useTestDatabase } from "../../src/harness/test-db";

describe("profiles", () => {
  const db = useTestDatabase();

  it("is created from auth.users and keeps email in sync", async () => {
    const userId = await db.createUser({ email: "Maria@Loja.test", fullName: "  Maria Souza " });
    const [profile] = await db
      .as(userId)
      .query<{ full_name: string; email: string }>("select full_name, email from public.profiles where id = $1", [
        userId,
      ]);
    expect(profile).toEqual({ full_name: "Maria Souza", email: "maria@loja.test" });

    await db.admin.query("update auth.users set email = 'nova@loja.test' where id = $1", [userId]);
    const [updated] = await db
      .as(userId)
      .query<{ email: string }>("select email from public.profiles where id = $1", [userId]);
    expect(updated!.email).toBe("nova@loja.test");
  });

  it("users edit only their own safe columns", async () => {
    const me = await db.createUser();
    const other = await db.createUser();

    const own = await db.as(me).query("update public.profiles set full_name = 'Eu' where id = $1 returning id", [me]);
    expect(own).toHaveLength(1);

    const foreign = await db
      .as(me)
      .query("update public.profiles set full_name = 'Hack' where id = $1 returning id", [other]);
    expect(foreign).toHaveLength(0);

    await expectDbError(
      db.as(me).query("update public.profiles set email = 'x@y.test' where id = $1", [me]),
      /permission denied/,
    );
  });

  it("colleagues are visible, strangers are not", async () => {
    const { tenantId, ownerId } = await db.createTenantWithOwner("Loja Perfis");
    const colleague = await db.addActiveMember(tenantId, "VENDEDOR");
    const stranger = await db.createUser();

    const rows = await db
      .as(ownerId)
      .query<{ id: string }>("select id from public.profiles where id = any($1::uuid[])", [[colleague, stranger]]);
    expect(rows.map((r) => r.id)).toEqual([colleague]);
  });
});
