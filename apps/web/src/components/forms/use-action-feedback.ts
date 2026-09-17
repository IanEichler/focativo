"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/lib/errors";

/**
 * Reage a um novo resultado de Server Action exatamente uma vez:
 * toast de sucesso + callback (ex.: fechar drawer).
 */
export function useActionFeedback<Field extends string>(
  state: ActionState<Field>,
  options: { onSuccess?: (state: Extract<ActionState<Field>, { status: "success" }>) => void; toastOnError?: boolean } = {},
) {
  const handled = useRef<ActionState<Field> | null>(null);
  const onSuccessRef = useRef(options.onSuccess);

  useEffect(() => {
    onSuccessRef.current = options.onSuccess;
  });

  useEffect(() => {
    if (handled.current === state || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") {
      if (state.message) toast.success(state.message);
      onSuccessRef.current?.(state);
    } else if (options.toastOnError) {
      toast.error(state.message);
    }
  }, [state, options.toastOnError]);
}
