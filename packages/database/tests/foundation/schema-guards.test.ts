import { describe, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";

/**
 * Guardas estruturais: falham se uma migration futura criar tabela sem RLS,
 * tabela com tenant_id sem policy, ou função SECURITY DEFINER insegura.
 */
describe("schema guards", () => {
  const db = useTestDatabase();

  it("every table in public has row level security enabled", async () => {
    const rows = await db.admin.query<{ table_name: string }>(`
      select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
    `);
    expect(rows.map((r) => r.table_name)).toEqual([]);
  });

  it("every table with tenant_id has at least one policy", async () => {
    const rows = await db.admin.query<{ table_name: string }>(`
      select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
    `);
    expect(rows.map((r) => r.table_name)).toEqual([]);
  });

  it("anon has no table privileges in public", async () => {
    const rows = await db.admin.query<{ table_name: string }>(`
      select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
        and (
          has_table_privilege('anon', c.oid, 'SELECT')
          or has_table_privilege('anon', c.oid, 'INSERT')
          or has_table_privilege('anon', c.oid, 'UPDATE')
          or has_table_privilege('anon', c.oid, 'DELETE')
        )
    `);
    expect(rows.map((r) => r.table_name)).toEqual([]);
  });

  it("anon cannot execute any function in public or private", async () => {
    const rows = await db.admin.query<{ fn: string }>(`
      select n.nspname || '.' || p.proname as fn
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
        and has_function_privilege('anon', p.oid, 'EXECUTE')
    `);
    expect(rows.map((r) => r.fn)).toEqual([]);
  });

  it("every security definer function pins search_path", async () => {
    const rows = await db.admin.query<{ fn: string }>(`
      select n.nspname || '.' || p.proname as fn
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
        and p.prosecdef
        and not exists (
          select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%'
        )
    `);
    expect(rows.map((r) => r.fn)).toEqual([]);
  });

  it("authenticated cannot write RPC-only tables directly (not even single columns)", async () => {
    const rows = await db.admin.query<{ table_name: string; privilege: string }>(`
      select t.table_name, priv.privilege
      from unnest(array[
        'tenant_users', 'platform_admins', 'audit_logs', 'platform_audit_logs', 'roles', 'permissions',
        'role_permissions', 'allergens', 'nutrients', 'products', 'product_variants', 'product_variant_costs',
        'product_attribute_values', 'product_allergens', 'product_nutrition', 'product_nutrition_values',
        'stock_levels', 'stock_lots', 'stock_movements', 'stock_movement_lots'
      ]) as t(table_name)
      cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) as priv(privilege)
      where has_table_privilege('authenticated', ('public.' || t.table_name)::regclass, priv.privilege)
         or (priv.privilege = 'UPDATE'
             and has_any_column_privilege('authenticated', ('public.' || t.table_name)::regclass, 'UPDATE'))
    `);
    expect(rows).toEqual([]);
  });

  it("tenant_id and id are never updatable through the API", async () => {
    const rows = await db.admin.query<{ table_name: string; column_name: string }>(`
      select c.relname as table_name, a.attname as column_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname in ('tenant_id', 'id') and not a.attisdropped
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and has_column_privilege('authenticated', c.oid, a.attname, 'UPDATE')
    `);
    expect(rows).toEqual([]);
  });

  it("every view is security_invoker so base-table RLS applies", async () => {
    const rows = await db.admin.query<{ view_name: string }>(`
      select c.relname as view_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and not coalesce('security_invoker=true' = any (c.reloptions), false)
    `);
    expect(rows).toEqual([]);
  });
});
