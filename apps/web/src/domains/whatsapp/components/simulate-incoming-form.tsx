"use client";

import { useActionState } from "react";
import { TextField } from "@/components/forms/text-field";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { IDLE, type ActionState } from "@/lib/errors";
import { simulateIncomingMessageAction } from "../actions";
import type { SimulateIncomingMessageField } from "../schemas";

export function SimulateIncomingForm() {
  const [state, action] = useActionState<ActionState<SimulateIncomingMessageField>, FormData>(
    simulateIncomingMessageAction,
    IDLE,
  );

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-5">
      <p className="text-body font-semibold">Simular mensagem recebida (dev)</p>
      <p className="text-caption text-subtle">
        Sem um celular real para testar, use este formulário para simular uma mensagem chegando de um cliente pelo
        webhook real.
      </p>
      <FormMessage state={state.status === "error" ? state : IDLE} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Telefone (WhatsApp)"
          name="whatsappNumber"
          placeholder="11999998888"
          error={fieldError(state, "whatsappNumber")}
        />
        <TextField
          label="Nome do contato"
          name="senderName"
          placeholder="Opcional"
          error={fieldError(state, "senderName")}
        />
      </div>
      <TextField label="Mensagem" name="content" placeholder="Olá, tudo bem?" error={fieldError(state, "content")} />
      <SubmitButton pendingLabel="Enviando…" className="self-start">
        Simular envio
      </SubmitButton>
    </form>
  );
}
