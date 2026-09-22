"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Mantém /app/atendimento atualizada sozinha — sem isso, uma conversa ou
 * mensagem nova só aparecia depois de um F5 manual (a página é toda
 * server-rendered, sem tempo real). Polling simples via router.refresh()
 * (mesmo padrão já usado após mutações no resto do app), não WebSocket —
 * suficiente para o volume de um inbox de atendimento e não exige
 * infraestrutura nova (Realtime do Supabase, canais, etc.). Pausa quando a
 * aba está em segundo plano, pra não gastar requisição à toa.
 */
export function InboxAutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
