"use client";

import { useEffect, useState } from "react";

export async function fetchSearchResults<T>(url: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível pesquisar. Tente novamente.");
  return response.json() as Promise<T[]>;
}

/** Debounce, cancellation and response ordering shared by all entity pickers. */
export function useSearchResults<T>(url: string, enabled = true, delay = 180) {
  const [result, setResult] = useState<{ url: string; items: T[]; error?: string }>({ url: "", items: [] });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const items = await fetchSearchResults<T>(url, controller.signal);
        if (!controller.signal.aborted) setResult({ url, items });
      } catch {
        if (!controller.signal.aborted)
          setResult({ url, items: [], error: "Não foi possível pesquisar. Tente novamente." });
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, enabled, delay]);
  const current = result.url === url;
  return {
    items: current ? result.items : [],
    loading: enabled && !current,
    error: current ? result.error : undefined,
  };
}

export function searchUrl(
  kind: "customers" | "inventory" | "products",
  query: string,
  extra: Record<string, string> = {},
) {
  return `/api/search?${new URLSearchParams({ kind, q: query.trim().slice(0, 100), ...extra })}`;
}
