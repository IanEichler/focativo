"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * `false` no servidor e durante a hidratação; `true` depois.
 * Use para valores que só existem no navegador (ex.: tema salvo) sem causar
 * divergência de hidratação.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
