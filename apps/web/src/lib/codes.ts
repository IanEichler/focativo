/** Gera código técnico (snake_case ASCII) a partir de um rótulo: "Cookies & Cream" → "cookies_cream". */
export function toCode(label: string, maxLength = 50): string {
  const code = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength)
    .replace(/_+$/g, "");
  return code;
}

/** Normalização usada nas buscas (espelha private.search_normalize do banco). */
export function searchNormalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
