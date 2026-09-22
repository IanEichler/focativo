import { z } from "zod";

/**
 * Converte números digitados no padrão brasileiro.
 *   "1.234,56" → 1234.56 · "139,90" → 139.9 · "139.90" → 139.9 · "1.500" → 1500
 * Retorna null para vazio e NaN para entrada inválida.
 */
export function parseDecimalBR(input: string | null | undefined): number | null {
  const raw = (input ?? "").trim().replace(/\s|R\$/g, "");
  if (raw === "") return null;

  let normalized: string;
  if (raw.includes(",")) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  } else {
    normalized = raw;
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

function decimalPlaces(value: number): number {
  const text = String(value);
  const index = text.indexOf(".");
  return index === -1 ? 0 : text.length - index - 1;
}

interface DecimalOptions {
  label: string;
  min?: number;
  max?: number;
  scale?: number;
  /** Exige valor estritamente maior que `min`. */
  exclusiveMin?: boolean;
}

function checkDecimal(value: number, options: DecimalOptions, ctx: z.RefinementCtx): boolean {
  const { label, min = 0, max = 9_999_999_999, scale = 2, exclusiveMin = false } = options;
  if (Number.isNaN(value)) {
    ctx.addIssue({ code: "custom", message: `${label}: informe um número válido.` });
    return false;
  }
  if (exclusiveMin ? value <= min : value < min) {
    ctx.addIssue({ code: "custom", message: `${label} deve ser ${exclusiveMin ? "maior que" : "no mínimo"} ${min}.` });
    return false;
  }
  if (value > max) {
    ctx.addIssue({ code: "custom", message: `${label} acima do permitido.` });
    return false;
  }
  if (decimalPlaces(value) > scale) {
    ctx.addIssue({ code: "custom", message: `${label}: use no máximo ${scale} casas decimais.` });
    return false;
  }
  return true;
}

/** Campo decimal opcional (string do formulário → number | null). */
export function optionalDecimal(options: DecimalOptions) {
  return z
    .string()
    .optional()
    .transform((input, ctx) => {
      const value = parseDecimalBR(input);
      if (value === null) return null;
      return checkDecimal(value, options, ctx) ? value : z.NEVER;
    });
}

/** Campo decimal obrigatório. */
export function requiredDecimal(options: DecimalOptions) {
  return z.string({ message: `Informe ${options.label.toLowerCase()}.` }).transform((input, ctx) => {
    const value = parseDecimalBR(input);
    if (value === null) {
      ctx.addIssue({ code: "custom", message: `Informe ${options.label.toLowerCase()}.` });
      return z.NEVER;
    }
    return checkDecimal(value, options, ctx) ? value : z.NEVER;
  });
}

/** Formata número para campos de formulário no padrão brasileiro (sem separador de milhar). */
export function toDecimalInput(value: number | null | undefined, scale = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  const fixed = Number(value).toFixed(scale);
  const trimmed = scale > 0 ? fixed.replace(/\.?0+$/, "") : fixed;
  const [integer, fraction] = (scale === 2 ? fixed : trimmed).split(".");
  return fraction ? `${integer},${fraction}` : (integer ?? "");
}

export const checkboxValue = z
  .string()
  .optional()
  .transform((value) => value === "on" || value === "true");

export const optionalUuid = z
  .string()
  .optional()
  .transform((value, ctx) => {
    // Valores sentinela de selects ("__none__", "__new__") significam "sem seleção".
    if (!value || value.startsWith("__")) return null;
    if (!z.uuid().safeParse(value).success) {
      ctx.addIssue({ code: "custom", message: "Seleção inválida." });
      return z.NEVER;
    }
    return value;
  });
