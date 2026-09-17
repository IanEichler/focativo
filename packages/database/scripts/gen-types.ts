/**
 * Gera `apps/web/src/types/database.types.ts` no mesmo formato do
 * `supabase gen types typescript`, sem Docker: aplica as migrations num
 * Postgres embutido e introspecta o catálogo.
 *
 * Com o projeto Supabase Cloud linkado, o gerador oficial também pode ser usado:
 *   supabase gen types typescript --linked --schema public
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { applyMigrations, connectionConfig, createDatabase, REPO_ROOT, startServer } from "../src/harness/server";

const OUTPUT = path.join(REPO_ROOT, "apps", "web", "src", "types", "database.types.ts");
const SCHEMA = "public";

type Column = {
  table_name: string;
  column_name: string;
  udt_name: string;
  data_type: string;
  is_nullable: boolean;
  has_default: boolean;
  is_identity_always: boolean;
  is_generated: boolean;
  type_category: string;
  element_type: string | null;
  element_category: string | null;
  relkind: string;
};

type Relationship = {
  table_name: string;
  constraint_name: string;
  columns: string[];
  referenced_table: string;
  referenced_columns: string[];
  is_one_to_one: boolean;
};

type FunctionDef = {
  name: string;
  arg_names: string[] | null;
  arg_types: string[];
  arg_udts: string[];
  arg_modes: string[] | null;
  n_defaults: number;
  returns_set: boolean;
  return_type: string;
  return_category: string;
  return_relation: string | null;
};

type EnumDef = { name: string; values: string[] };

const quote = (value: string) => JSON.stringify(value);
const key = (value: string) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : quote(value));

function scalarType(udt: string, category: string, enums: Set<string>): string {
  if (enums.has(udt)) return `Database[${quote(SCHEMA)}]["Enums"][${quote(udt)}]`;
  switch (udt) {
    case "bool":
      return "boolean";
    case "int2":
    case "int4":
    case "int8":
    case "float4":
    case "float8":
    case "numeric":
      return "number";
    case "json":
    case "jsonb":
      return "Json";
    case "void":
      return "undefined";
    case "uuid":
    case "text":
    case "varchar":
    case "bpchar":
    case "char":
    case "citext":
    case "date":
    case "time":
    case "timetz":
    case "timestamp":
    case "timestamptz":
    case "interval":
    case "inet":
    case "bytea":
      return "string";
    default:
      return category === "S" ? "string" : "unknown";
  }
}

async function introspect(client: pg.Client) {
  const enumsResult = await client.query<EnumDef>(
    `select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as values
     from pg_type t
     join pg_enum e on e.enumtypid = t.oid
     join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = $1
     group by t.typname
     order by t.typname`,
    [SCHEMA],
  );

  const columnsResult = await client.query<Column>(
    `select c.relname as table_name,
            a.attname as column_name,
            t.typname as udt_name,
            format_type(a.atttypid, a.atttypmod) as data_type,
            not a.attnotnull as is_nullable,
            (a.atthasdef or a.attidentity <> '') as has_default,
            a.attidentity = 'a' as is_identity_always,
            a.attgenerated <> '' as is_generated,
            t.typcategory as type_category,
            et.typname as element_type,
            et.typcategory as element_category,
            c.relkind as relkind
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     join pg_type t on t.oid = a.atttypid
     left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
     where n.nspname = $1 and c.relkind in ('r', 'p', 'v')
     order by c.relname, a.attname`,
    [SCHEMA],
  );

  const relationshipsResult = await client.query<Relationship>(
    `select src.relname as table_name,
            con.conname as constraint_name,
            array(select att.attname::text from unnest(con.conkey) with ordinality k(attnum, ord)
                  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
                  order by k.ord) as columns,
            ref.relname as referenced_table,
            array(select att.attname::text from unnest(con.confkey) with ordinality k(attnum, ord)
                  join pg_attribute att on att.attrelid = con.confrelid and att.attnum = k.attnum
                  order by k.ord) as referenced_columns,
            exists (
              select 1 from pg_index i
              where i.indrelid = con.conrelid and i.indisunique
                and (select array_agg(x order by x) from unnest(i.indkey::int2[]) x)
                  = (select array_agg(x order by x) from unnest(con.conkey) x)
            ) as is_one_to_one
     from pg_constraint con
     join pg_class src on src.oid = con.conrelid
     join pg_namespace n on n.oid = src.relnamespace
     join pg_class ref on ref.oid = con.confrelid
     join pg_namespace rn on rn.oid = ref.relnamespace
     where con.contype = 'f' and n.nspname = $1 and rn.nspname = $1
     order by src.relname, con.conname`,
    [SCHEMA],
  );

  const functionsResult = await client.query<FunctionDef>(
    `select p.proname as name,
            p.proargnames as arg_names,
            array(select format_type(x, null) from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) x) as arg_types,
            array(select t.typname::text from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality u(x, ord)
                  join pg_type t on t.oid = u.x order by u.ord) as arg_udts,
            p.proargmodes::text[] as arg_modes,
            p.pronargdefaults as n_defaults,
            p.proretset as returns_set,
            rt.typname as return_type,
            rt.typcategory as return_category,
            rel.relname as return_relation
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     join pg_type rt on rt.oid = p.prorettype
     left join pg_class rel on rel.oid = rt.typrelid and rel.relkind in ('r', 'p', 'v')
     where n.nspname = $1 and p.prokind = 'f' and rt.typname not in ('trigger', 'event_trigger')
     order by p.proname`,
    [SCHEMA],
  );

  return {
    enums: enumsResult.rows,
    columns: columnsResult.rows,
    relationships: relationshipsResult.rows,
    functions: functionsResult.rows,
  };
}

function render(data: Awaited<ReturnType<typeof introspect>>): string {
  const enumNames = new Set(data.enums.map((e) => e.name));

  const columnType = (column: Column) => {
    if (column.type_category === "A" && column.element_type) {
      return `${scalarType(column.element_type, column.element_category ?? "", enumNames)}[]`;
    }
    return scalarType(column.udt_name, column.type_category, enumNames);
  };

  const tables = [...new Set(data.columns.filter((c) => c.relkind !== "v").map((c) => c.table_name))].sort();
  const views = [...new Set(data.columns.filter((c) => c.relkind === "v").map((c) => c.table_name))].sort();
  const indent = (level: number) => "  ".repeat(level);

  const tableBlocks = tables.map((table) => {
    const columns = data.columns.filter((c) => c.table_name === table);
    const row = columns.map(
      (c) => `${indent(5)}${key(c.column_name)}: ${columnType(c)}${c.is_nullable ? " | null" : ""}`,
    );
    const insert = columns.map((c) => {
      if (c.is_generated || c.is_identity_always) return `${indent(5)}${key(c.column_name)}?: never`;
      const optional = c.is_nullable || c.has_default ? "?" : "";
      return `${indent(5)}${key(c.column_name)}${optional}: ${columnType(c)}${c.is_nullable ? " | null" : ""}`;
    });
    const update = columns.map((c) => {
      if (c.is_generated || c.is_identity_always) return `${indent(5)}${key(c.column_name)}?: never`;
      return `${indent(5)}${key(c.column_name)}?: ${columnType(c)}${c.is_nullable ? " | null" : ""}`;
    });
    const rels = data.relationships
      .filter((r) => r.table_name === table)
      .map(
        (r) =>
          `${indent(5)}{\n` +
          `${indent(6)}foreignKeyName: ${quote(r.constraint_name)}\n` +
          `${indent(6)}columns: [${r.columns.map(quote).join(", ")}]\n` +
          `${indent(6)}isOneToOne: ${r.is_one_to_one}\n` +
          `${indent(6)}referencedRelation: ${quote(r.referenced_table)}\n` +
          `${indent(6)}referencedColumns: [${r.referenced_columns.map(quote).join(", ")}]\n` +
          `${indent(5)}},`,
      );

    return [
      `${indent(3)}${key(table)}: {`,
      `${indent(4)}Row: {`,
      ...row,
      `${indent(4)}}`,
      `${indent(4)}Insert: {`,
      ...insert,
      `${indent(4)}}`,
      `${indent(4)}Update: {`,
      ...update,
      `${indent(4)}}`,
      rels.length ? `${indent(4)}Relationships: [\n${rels.join("\n")}\n${indent(4)}]` : `${indent(4)}Relationships: []`,
      `${indent(3)}}`,
    ].join("\n");
  });

  // Colunas de views são sempre anuláveis para o Postgres (mesmo comportamento do gerador oficial).
  const viewBlocks = views.map((view) => {
    const columns = data.columns.filter((c) => c.table_name === view);
    const row = columns.map((c) => `${indent(5)}${key(c.column_name)}: ${columnType(c)} | null`);
    return [
      `${indent(3)}${key(view)}: {`,
      `${indent(4)}Row: {`,
      ...row,
      `${indent(4)}}`,
      `${indent(4)}Relationships: []`,
      `${indent(3)}}`,
    ].join("\n");
  });

  const functionBlocks = data.functions.map((fn) => {
    const names = fn.arg_names ?? [];
    const modes = fn.arg_modes ?? fn.arg_types.map(() => "i");
    const inArgs: string[] = [];
    const outCols: string[] = [];
    const inputIndexes = modes.map((m, i) => (m === "i" || m === "b" || m === "v" ? i : -1)).filter((i) => i >= 0);
    const firstDefault = inputIndexes.length - fn.n_defaults;

    modes.forEach((mode, index) => {
      const name = names[index] ?? `arg${index}`;
      const udt = fn.arg_udts[index] ?? "unknown";
      const isArray = udt.startsWith("_");
      const base = scalarType(isArray ? udt.slice(1) : udt, "", enumNames);
      const type = isArray ? `${base}[]` : base;
      if (mode === "i" || mode === "b" || mode === "v") {
        const position = inputIndexes.indexOf(index);
        inArgs.push(`${indent(5)}${key(name)}${position >= firstDefault ? "?" : ""}: ${type}`);
      }
      if (mode === "o" || mode === "b" || mode === "t") {
        outCols.push(`${indent(6)}${key(name)}: ${type}`);
      }
    });

    let returns: string;
    if (outCols.length && (fn.return_type === "record" || fn.returns_set)) {
      returns = `{\n${outCols.join("\n")}\n${indent(5)}}${fn.returns_set ? "[]" : ""}`;
    } else if (fn.return_relation) {
      const row = `Database[${quote(SCHEMA)}]["Tables"][${quote(fn.return_relation)}]["Row"]`;
      returns = fn.returns_set ? `${row}[]` : row;
    } else {
      const isArray = fn.return_type.startsWith("_");
      const base = scalarType(isArray ? fn.return_type.slice(1) : fn.return_type, fn.return_category, enumNames);
      const scalar = isArray ? `${base}[]` : base;
      returns = fn.returns_set ? `${scalar}[]` : scalar;
    }

    const args = inArgs.length ? `{\n${inArgs.join("\n")}\n${indent(4)}}` : "never";
    return `${indent(3)}${key(fn.name)}: {\n${indent(4)}Args: ${args}\n${indent(4)}Returns: ${returns}\n${indent(3)}}`;
  });

  const enumBlocks = data.enums.map((e) => `${indent(3)}${key(e.name)}: ${e.values.map(quote).join(" | ")}`);
  const constantEnums = data.enums.map((e) => `${indent(3)}${key(e.name)}: [${e.values.map(quote).join(", ")}],`);
  const never = "{\n" + `${indent(3)}[_ in never]: never\n` + `${indent(2)}}`;

  return `// Arquivo gerado por \`pnpm db:types\` — NÃO EDITAR MANUALMENTE.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13"
  }
  public: {
    Tables: {
${tableBlocks.join("\n")}
    }
    Views: ${viewBlocks.length ? `{\n${viewBlocks.join("\n")}\n    }` : never}
    Functions: {
${functionBlocks.join("\n")}
    }
    Enums: {
${enumBlocks.join("\n")}
    }
    CompositeTypes: ${never}
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
export type Functions<T extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][T]

export const Constants = {
  public: {
    Enums: {
${constantEnums.join("\n")}
    },
  },
} as const
`;
}

async function main() {
  const server = await startServer();
  try {
    await createDatabase(server.info, "typegen");
    const client = new pg.Client(connectionConfig(server.info, "typegen"));
    await client.connect();
    try {
      await applyMigrations(client);
      const output = render(await introspect(client));
      await writeFile(OUTPUT, output, "utf8");
      console.log(`Types written to ${path.relative(REPO_ROOT, OUTPUT)}`);
    } finally {
      await client.end();
    }
  } finally {
    await server.stop();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
