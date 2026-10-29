import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

/**
 * Uma função comum (não componente) exportada de um módulo "use client" não pode
 * ser chamada de um módulo do servidor: o Next troca a exportação por uma
 * referência de cliente e a página cai em erro em tempo de execução — o build
 * e a tipagem não acusam. Foi o que derrubou a aba Financeiro da cliente.
 */
const SRC = path.resolve(__dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const isClient = (source: string) => /^\s*["']use client["']/.test(source);

function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // tenta o próximo
    }
  }
  return null;
}

it("server modules never call plain functions exported from 'use client' modules", () => {
  const files = walk(SRC);
  const sources = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
  const problems: string[] = [];

  for (const [file, source] of sources) {
    if (isClient(source)) continue;
    for (const match of source.matchAll(/import\s+(?!type\b)\{([^}]+)\}\s+from\s+["']([^"']+)["']/g)) {
      const target = resolveImport(file, match[2]!);
      const targetSource = target ? sources.get(target) : undefined;
      if (!targetSource || !isClient(targetSource)) continue;
      const names = match[1]!
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part && !part.startsWith("type "))
        .map((part) => part.split(/\s+as\s+/)[0]!.trim());
      // Componentes (PascalCase) podem cruzar a fronteira; funções comuns (camelCase) não.
      const plain = names.filter((name) => /^[a-z]/.test(name));
      for (const name of plain)
        problems.push(`${path.relative(SRC, file)} → ${name} (de ${path.relative(SRC, target!)})`);
    }
  }

  expect(problems).toEqual([]);
});
