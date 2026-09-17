export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** Primeiro valor de um search param (Next entrega string | string[]). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePage(value: string | string[] | undefined): number {
  const page = Number.parseInt(firstParam(value) ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1;
}

/** Monta href preservando params atuais, aplicando alterações (undefined remove). */
export function buildHref(
  pathname: string,
  current: SearchParamsRecord | URLSearchParams,
  patch: Record<string, string | number | undefined | null>,
): string {
  const params = new URLSearchParams();
  if (current instanceof URLSearchParams) {
    current.forEach((value, key) => params.append(key, value));
  } else {
    for (const [key, value] of Object.entries(current)) {
      const first = firstParam(value);
      if (first !== undefined) params.set(key, first);
    }
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
