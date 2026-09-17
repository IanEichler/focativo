import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, expect, inject } from "vitest";
import { connectionConfig, createDatabase, dropDatabase, TEMPLATE_DB } from "./server";

export type Row = Record<string, unknown>;
type Args = Record<string, unknown>;

export interface Session {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Chama uma função do schema public com argumentos nomeados (como o PostgREST). */
  rpc<T extends Row = Row>(fn: string, args?: Args): Promise<T[]>;
}

export interface TestDatabase {
  /** Superusuário: prepara cenários, ignora RLS. */
  admin: Session;
  /** Sessão autenticada, idêntica ao que o PostgREST faz com o JWT do usuário. */
  as(userId: string): Session;
  anon: Session;
  service: Session;
  createUser(input?: { email?: string; fullName?: string }): Promise<string>;
  makeSuperAdmin(userId: string): Promise<void>;
  /** Cria usuário + tenant em que ele é OWNER. */
  createTenantWithOwner(name?: string): Promise<{ tenantId: string; ownerId: string }>;
  /** Adiciona um membro já ativo com o papel indicado (atalho de cenário). */
  addActiveMember(tenantId: string, role: string, email?: string): Promise<string>;
  pool: pg.Pool;
}

function rpcSql(fn: string, args: Args): { sql: string; params: unknown[] } {
  if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw new Error(`Invalid function name: ${fn}`);
  const keys = Object.keys(args);
  keys.forEach((key) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(key)) throw new Error(`Invalid argument name: ${key}`);
  });
  const list = keys.map((key, index) => `${key} => $${index + 1}`).join(", ");
  return { sql: `select * from public.${fn}(${list})`, params: keys.map((key) => args[key]) };
}

function createSession(
  pool: pg.Pool,
  role: "postgres" | "authenticated" | "anon" | "service_role",
  userId?: string,
): Session {
  async function query<T extends Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      if (role !== "postgres") {
        const claims = JSON.stringify(userId ? { sub: userId, role } : { role });
        await client.query("select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)", [
          role,
          claims,
        ]);
      }
      const result = await client.query(sql, params);
      await client.query("commit");
      return result.rows as T[];
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    query,
    rpc: (fn, args = {}) => {
      const { sql, params } = rpcSql(fn, args);
      return query(sql, params);
    },
  };
}

/**
 * Registra hooks que criam um banco isolado (clonado do template migrado)
 * para o arquivo de teste atual.
 */
export function useTestDatabase(): TestDatabase {
  const name = `test_${randomUUID().replaceAll("-", "")}`;
  let pool: pg.Pool | undefined;
  const info = inject("db");

  const getPool = () => {
    if (!pool) throw new Error("Test database not initialised");
    return pool;
  };

  beforeAll(async () => {
    await createDatabase(info, name, TEMPLATE_DB);
    pool = new pg.Pool({ ...connectionConfig(info, name), max: 20 });
  });

  afterAll(async () => {
    await pool?.end();
    await dropDatabase(info, name);
  });

  const lazy = (factory: (p: pg.Pool) => Session): Session => ({
    query: (sql, params) => factory(getPool()).query(sql, params),
    rpc: (fn, args) => factory(getPool()).rpc(fn, args),
  });

  const admin = lazy((p) => createSession(p, "postgres"));

  const db: TestDatabase = {
    admin,
    anon: lazy((p) => createSession(p, "anon")),
    service: lazy((p) => createSession(p, "service_role")),
    as: (userId) => lazy((p) => createSession(p, "authenticated", userId)),
    get pool() {
      return getPool();
    },
    async createUser(input = {}) {
      const email = input.email ?? `user-${randomUUID().slice(0, 8)}@example.test`;
      const rows = await admin.query<{ id: string }>(
        "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
        [email, JSON.stringify({ full_name: input.fullName ?? "Test User" })],
      );
      return rows[0]!.id;
    },
    async makeSuperAdmin(userId) {
      await admin.query("insert into public.platform_admins (user_id, note) values ($1, 'test')", [userId]);
    },
    async createTenantWithOwner(name = "Loja Teste") {
      const ownerId = await db.createUser({ fullName: "Owner" });
      const rows = await db.as(ownerId).rpc<{ create_tenant: string }>("create_tenant", { p_name: name });
      return { tenantId: rows[0]!.create_tenant, ownerId };
    },
    async addActiveMember(tenantId, role, email) {
      const userId = await db.createUser({ email });
      await admin.query(
        `insert into public.tenant_users (tenant_id, user_id, role_code, status, joined_at)
         values ($1, $2, $3, 'ACTIVE', now())`,
        [tenantId, userId, role],
      );
      return userId;
    },
  };

  return db;
}

/** Garante que a promessa falha com a mensagem-código indicada. */
export async function expectDbError(promise: Promise<unknown>, message: string | RegExp): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error, `expected database error ${String(message)}`).toBeInstanceOf(Error);
  const actual = (error as Error).message;
  if (typeof message === "string") {
    expect(actual).toBe(message);
  } else {
    expect(actual).toMatch(message);
  }
}
