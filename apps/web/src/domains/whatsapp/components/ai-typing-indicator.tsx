"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AiTypingIndicator({ conversationId, active }: { conversationId: string; active: boolean }) {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (!active) return;
    const supabase = createClient();
    const controller = new AbortController();
    let busy = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      if (busy || controller.signal.aborted) return;
      if (document.visibilityState !== "visible") {
        setTyping(false);
        return;
      }
      busy = true;
      try {
        const { data, error } = await supabase
          .from("conversations")
          .select("status, ai_typing_until")
          .eq("id", conversationId)
          .abortSignal(controller.signal)
          .maybeSingle();
        if (controller.signal.aborted) return;
        clearTimeout(expiry);
        const remaining = data?.ai_typing_until ? Date.parse(data.ai_typing_until) - Date.now() : 0;
        const visible = !error && data?.status === "AI_ACTIVE" && remaining > 0;
        setTyping(visible);
        if (visible) expiry = setTimeout(() => setTyping(false), remaining);
      } catch {
        if (!controller.signal.aborted) setTyping(false);
      } finally {
        busy = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 1500);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      clearTimeout(expiry);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [conversationId, active]);

  if (!active || !typing) return null;
  return (
    <div role="status" aria-live="polite" className="flex shrink-0 justify-end px-4 pb-3">
      <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-2 text-caption text-subtle">
        <span aria-hidden="true" className="flex gap-1">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="size-1.5 rounded-full bg-current motion-safe:animate-bounce"
              style={{ animationDelay: `${dot * 150}ms` }}
            />
          ))}
        </span>
        Assistente digitando…
      </div>
    </div>
  );
}
