"use client";

import { useActionState, useState } from "react";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IDLE, type ActionState } from "@/lib/errors";
import { saveAiPlatformLimitsAction } from "../actions";
import { AI_MODELS, AI_PROVIDERS, type AiPlatformLimitsField } from "../schemas";
import type { AiPlatformLimits } from "../queries";

export function AiPlatformLimitsCard({ tenantId, limits }: { tenantId: string; limits: AiPlatformLimits }) {
  const [state, action] = useActionState<ActionState<AiPlatformLimitsField>, FormData>(
    saveAiPlatformLimitsAction,
    IDLE,
  );
  useActionFeedback(state, { toastOnError: true });

  const values = state.status === "error" ? state.values : undefined;
  const pick = (field: AiPlatformLimitsField, fallback: string | number | null | undefined) =>
    values?.[field] ?? fallback ?? undefined;

  const [provider, setProvider] = useState((pick("provider", limits.provider) as string) ?? "anthropic");
  const modelsForProvider = AI_MODELS.filter((m) => m.provider === provider);

  return (
    <Card>
      <CardHeader>
        <CardTitle>IA — provider, modelo e limites</CardTitle>
        <CardDescription>Só o admin master decide. O tenant não vê nem edita isto.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="tenantId" value={tenantId} />
          <FormMessage state={state.status === "error" ? state : IDLE} />

          <SelectField
            label="Provider"
            name="provider"
            options={AI_PROVIDERS}
            defaultValue={provider}
            onValueChange={setProvider}
            error={fieldError(state, "provider")}
          />
          <SelectField
            key={provider}
            label="Modelo"
            name="model"
            options={modelsForProvider.map((m) => ({ value: m.value, label: m.label }))}
            defaultValue={
              modelsForProvider.some((m) => m.value === pick("model", limits.model))
                ? ((pick("model", limits.model) as string) ?? modelsForProvider[0]!.value)
                : modelsForProvider[0]!.value
            }
            error={fieldError(state, "model")}
          />
          <TextField
            label="Máximo de tokens por resposta"
            name="maxTokensPerReply"
            inputMode="numeric"
            defaultValue={pick("maxTokensPerReply", limits.maxTokensPerReply)}
            error={fieldError(state, "maxTokensPerReply")}
          />
          <TextField
            label="Orçamento mensal em dólar (opcional)"
            name="monthlyBudgetUsd"
            inputMode="decimal"
            placeholder="Sem limite"
            defaultValue={pick(
              "monthlyBudgetUsd",
              limits.monthlyBudgetCents != null ? limits.monthlyBudgetCents / 100 : null,
            )}
            error={fieldError(state, "monthlyBudgetUsd")}
            description="Quando atingido, a conversa é transferida automaticamente para um humano."
          />

          <SubmitButton pendingLabel="Salvando…" className="self-start">
            Salvar limites
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
