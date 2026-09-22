"use client";

import { useActionState } from "react";
import { SwitchField, TextareaField } from "@/components/forms/fields";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { IDLE, type ActionState } from "@/lib/errors";
import { saveAiSettingsAction } from "../actions";
import { AI_MODELS, type AiSettingsField } from "../schemas";
import type { AiSettings } from "../queries";

export function AiSettingsForm({ settings }: { settings: AiSettings }) {
  const [state, action] = useActionState<ActionState<AiSettingsField>, FormData>(saveAiSettingsAction, IDLE);
  useActionFeedback(state, { toastOnError: true });

  const values = state.status === "error" ? state.values : undefined;
  const pick = (field: AiSettingsField, fallback: string | number | null | undefined) =>
    values?.[field] ?? fallback ?? undefined;

  return (
    <form action={action} className="flex flex-col gap-5">
      <FormMessage state={state.status === "error" ? state : IDLE} />

      <SwitchField
        label="IA ativada"
        name="enabled"
        defaultChecked={settings.enabled}
        description="Enquanto desligada, novas conversas no WhatsApp nascem para um humano atender."
      />

      <TextareaField
        label="Prompt de sistema (opcional)"
        name="systemPrompt"
        rows={5}
        maxLength={4000}
        placeholder="Ex.: Você é a assistente da Loja X. Fale de forma simpática e objetiva…"
        defaultValue={pick("systemPrompt", settings.systemPrompt) as string | undefined}
        error={fieldError(state, "systemPrompt")}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Modelo"
          name="model"
          options={AI_MODELS.map((m) => ({ value: m.value, label: m.label }))}
          defaultValue={(pick("model", settings.model) as string) ?? "claude-sonnet-5"}
          error={fieldError(state, "model")}
        />
        <TextField
          label="Máximo de tokens por resposta"
          name="maxTokensPerReply"
          inputMode="numeric"
          defaultValue={pick("maxTokensPerReply", settings.maxTokensPerReply)}
          error={fieldError(state, "maxTokensPerReply")}
        />
      </div>

      <TextField
        label="Orçamento mensal em dólar (opcional)"
        name="monthlyBudgetUsd"
        inputMode="decimal"
        placeholder="Sem limite"
        defaultValue={pick(
          "monthlyBudgetUsd",
          settings.monthlyBudgetCents != null ? settings.monthlyBudgetCents / 100 : null,
        )}
        error={fieldError(state, "monthlyBudgetUsd")}
        description="Quando atingido, a conversa é transferida automaticamente para um humano em vez de continuar respondendo."
      />

      <SubmitButton pendingLabel="Salvando…" className="self-start">
        Salvar configurações
      </SubmitButton>
    </form>
  );
}
