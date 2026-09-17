import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../../..");
export const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase", "migrations");
export const TEMPLATE_DB = "app_template";

export interface DbServerInfo {
  host: string;
  port: number;
  user: string;
  password: string;
}

export interface RunningServer {
  info: DbServerInfo;
  stop: () => Promise<void>;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (address && typeof address === "object") {
        const { port } = address;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Could not allocate a free port")));
      }
    });
  });
}

/**
 * Sobe um Postgres real (binário embutido, sem Docker) em diretório temporário
 * fora do projeto — nunca dentro de pastas sincronizadas (ex.: OneDrive).
 */
export async function startServer(): Promise<RunningServer> {
  const databaseDir = await mkdtemp(path.join(tmpdir(), "estoque-ia-pg-"));
  const info: DbServerInfo = {
    host: "127.0.0.1",
    port: await getFreePort(),
    user: "postgres",
    password: "postgres",
  };

  const server = new EmbeddedPostgres({
    databaseDir,
    port: info.port,
    user: info.user,
    password: info.password,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--locale-provider=builtin", "--builtin-locale=C.UTF-8"],
    postgresFlags: ["-c", "max_connections=200", "-c", "fsync=off", "-c", "full_page_writes=off", "-c", "timezone=UTC"],
    onLog: () => {},
    onError: (message) => {
      if (process.env.DEBUG_PG) console.error("[postgres]", message);
    },
  });

  await server.initialise();
  await server.start();

  return {
    info,
    stop: async () => {
      await server.stop();
      await rm(databaseDir, { recursive: true, force: true });
    },
  };
}

export function connectionConfig(info: DbServerInfo, database: string): pg.ClientConfig {
  return { ...info, database };
}

export async function listMigrationFiles(): Promise<string[]> {
  return (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
}

/** Aplica shim do Supabase + todas as migrations, cada uma em sua transação. */
export async function applyMigrations(client: pg.Client): Promise<void> {
  const shim = await readFile(path.join(here, "supabase-shim.sql"), "utf8");
  await client.query(shim);

  for (const file of await listMigrationFiles()) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file} failed: ${message}`);
    }
  }
}

export async function createDatabase(info: DbServerInfo, name: string, template?: string): Promise<void> {
  const client = new pg.Client(connectionConfig(info, "postgres"));
  await client.connect();
  try {
    const templateClause = template ? ` template ${pg.escapeIdentifier(template)}` : "";
    for (let attempt = 0; ; attempt++) {
      try {
        await client.query(`create database ${pg.escapeIdentifier(name)}${templateClause}`);
        return;
      } catch (error) {
        // Clonagens concorrentes do mesmo template podem colidir momentaneamente.
        const busy = error instanceof Error && /being accessed by other users/.test(error.message);
        if (!busy || attempt >= 20) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));
      }
    }
  } finally {
    await client.end();
  }
}

export async function dropDatabase(info: DbServerInfo, name: string): Promise<void> {
  const client = new pg.Client(connectionConfig(info, "postgres"));
  await client.connect();
  try {
    await client.query(`drop database if exists ${pg.escapeIdentifier(name)} with (force)`);
  } finally {
    await client.end();
  }
}

/** Cria o banco template com todas as migrations aplicadas. */
export async function createMigratedTemplate(info: DbServerInfo): Promise<void> {
  await createDatabase(info, TEMPLATE_DB);
  const client = new pg.Client(connectionConfig(info, TEMPLATE_DB));
  await client.connect();
  try {
    await applyMigrations(client);
  } finally {
    await client.end();
  }
}
