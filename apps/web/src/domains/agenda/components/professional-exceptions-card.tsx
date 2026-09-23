"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IDLE, type ActionState } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { createProfessionalExceptionAction, deleteProfessionalExceptionAction } from "../actions";
import type { ProfessionalExceptionField } from "../schemas";
import type { ProfessionalExceptionRow } from "../queries";

export function ProfessionalExceptionsCard({
  exceptions,
  professionals,
}: {
  exceptions: ProfessionalExceptionRow[];
  professionals: { userId: string; fullName: string }[];
}) {
  const [state, action] = useActionState<ActionState<ProfessionalExceptionField>, FormData>(
    createProfessionalExceptionAction,
    IDLE,
  );
  const [pending, startTransition] = useTransition();

  function nameOf(userId: string) {
    return professionals.find((p) => p.userId === userId)?.fullName ?? "Profissional";
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteProfessionalExceptionAction(id);
      if (result.status === "success") toast.success(result.message);
      else if (result.status === "error") toast.error(result.message);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exceções (folgas)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form action={action} className="flex flex-wrap items-end gap-3">
          <FormMessage state={state.status === "error" ? state : IDLE} />
          <SelectField
            label="Profissional"
            name="professionalUserId"
            options={professionals.map((p) => ({ value: p.userId, label: p.fullName }))}
            error={fieldError(state, "professionalUserId")}
          />
          <TextField label="Data" name="date" type="date" error={fieldError(state, "date")} />
          <TextField
            label="Motivo (opcional)"
            name="reason"
            placeholder="Ex.: consulta médica"
            error={fieldError(state, "reason")}
          />
          <SubmitButton pendingLabel="Salvando…">Registrar exceção</SubmitButton>
        </form>

        {exceptions.length === 0 ? (
          <p className="text-small text-muted-foreground">Nenhuma exceção registrada.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {exceptions.map((exception) => (
              <li key={exception.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex flex-col">
                  <span className="font-medium">
                    {nameOf(exception.professionalUserId)} — {formatDate(exception.date)}
                  </span>
                  {exception.reason && <span className="text-small text-muted-foreground">{exception.reason}</span>}
                </div>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(exception.id)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
