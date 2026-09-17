"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ActionState } from "@/lib/errors";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  pendingLabel,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={className} {...props}>
      {pending && <Spinner />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

/** Mensagem geral do formulário (sucesso/erro), anunciada a leitores de tela. */
export function FormMessage({ state, className }: { state: ActionState<string>; className?: string }) {
  if (state.status === "idle") return null;
  const success = state.status === "success";
  if (success && !state.message) return null;

  return (
    <div
      role={success ? "status" : "alert"}
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2.5 text-body",
        success ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
        className,
      )}
    >
      {success ? (
        <CircleCheck className="mt-0.5 size-4 shrink-0" />
      ) : (
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{state.message}</span>
    </div>
  );
}

export function fieldError<Field extends string>(state: ActionState<Field>, field: Field): string | undefined {
  return state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;
}

export function FieldMessage({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-small text-danger">
      {message}
    </p>
  );
}
