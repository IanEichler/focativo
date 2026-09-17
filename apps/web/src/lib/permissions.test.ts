import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasPermission, PERMISSIONS, ROLE_CODES } from "./permissions";

/**
 * O catálogo TypeScript precisa espelhar exatamente o que as migrations
 * cadastram — evita UI checando permissão que o banco não conhece.
 */
describe("permission catalog stays in sync with migrations", () => {
  const migrationsDir = path.resolve(__dirname, "../../../../supabase/migrations");
  const sql = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(path.join(migrationsDir, file), "utf8"))
    .join("\n");

  /** Conteúdo de cada `insert into <table> ... ;` encontrado nas migrations. */
  function insertBlocks(table: string): string[] {
    const blocks: string[] = [];
    let index = sql.indexOf(`insert into ${table} `);
    while (index !== -1) {
      blocks.push(sql.slice(index, sql.indexOf(";", index)));
      index = sql.indexOf(`insert into ${table} `, index + 1);
    }
    return blocks;
  }

  it("matches permissions inserted in the database", () => {
    const dbPermissions = insertBlocks("public.permissions")
      .flatMap((block) => [...block.matchAll(/\('([a-z_]+\.[a-z_]+)'/g)].map((match) => match[1]))
      .sort();
    expect([...PERMISSIONS].sort()).toEqual(dbPermissions);
  });

  it("matches roles inserted in the database", () => {
    const dbRoles = insertBlocks("public.roles")
      .flatMap((block) => [...block.matchAll(/\('([A-Z_]+)'/g)].map((match) => match[1]))
      .sort();
    expect([...ROLE_CODES].sort()).toEqual(dbRoles);
  });

  it("checks permissions from sets and arrays", () => {
    expect(hasPermission(new Set(["users.read"]), "users.read")).toBe(true);
    expect(hasPermission(["users.read"], "users.manage")).toBe(false);
  });
});
