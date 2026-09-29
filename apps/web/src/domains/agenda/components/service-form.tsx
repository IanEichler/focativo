"use client";

import { useActionState, useState } from "react";
import { SwitchField, TextareaField } from "@/components/forms/fields";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { FormDialog, DialogFormLayout } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toDecimalInput } from "@/lib/decimal";
import { IDLE, type ActionState } from "@/lib/errors";
import { saveServiceAction } from "../actions";
import type { ProfessionalOption, ServiceRow } from "../queries";
import type { ServiceField } from "../schemas";

export function ServiceFormDialog({
  trigger,
  service,
  professionals,
}: {
  trigger: React.ReactNode;
  service?: ServiceRow;
  professionals: ProfessionalOption[];
}) {
  return (
    <FormDialog
      size="lg"
      trigger={trigger}
      title={service ? "Editar serviço" : "Novo serviço"}
      description={service?.name}
    >
      {(close) => <ServiceForm service={service} professionals={professionals} onDone={close} />}
    </FormDialog>
  );
}

function ServiceForm({
  service,
  professionals,
  onDone,
}: {
  service?: ServiceRow;
  professionals: ProfessionalOption[];
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState<ServiceField>, FormData>(saveServiceAction, IDLE);
  const values = state.status === "error" ? state.values : undefined;
  const pick = (field: ServiceField, fallback: string | null | undefined) => values?.[field] ?? fallback ?? undefined;
  const [selectedProfessionals, setSelectedProfessionals] = useState<Set<string>>(
    new Set(service?.professionalUserIds ?? []),
  );

  useActionFeedback(state, { onSuccess: onDone });

  function toggleProfessional(userId: string, checked: boolean) {
    setSelectedProfessionals((current) => {
      const next = new Set(current);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl" noValidate>
      {service && <input type="hidden" name="id" value={service.id} />}
      <input type="hidden" name="professionalUserIds" value={JSON.stringify([...selectedProfessionals])} />
      <DialogFormLayout
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <SubmitButton pendingLabel="Salvando…">{service ? "Salvar alterações" : "Criar serviço"}</SubmitButton>
          </>
        }
      >
        <FormMessage state={state.status === "error" ? state : IDLE} />

        <TextField
          label="Nome do serviço"
          name="name"
          required
          defaultValue={pick("name", service?.name)}
          error={fieldError(state, "name")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Duração (minutos)"
            name="durationMinutes"
            inputMode="numeric"
            required
            defaultValue={pick("durationMinutes", service?.durationMinutes?.toString())}
            error={fieldError(state, "durationMinutes")}
          />
          <TextField
            label="Preço"
            name="price"
            required
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={pick("price", toDecimalInput(service?.price ?? 0))}
            error={fieldError(state, "price")}
          />
        </div>
        <TextareaField
          label="Descrição do procedimento"
          name="description"
          rows={4}
          maxLength={2000}
          defaultValue={pick("description", service?.description)}
          error={fieldError(state, "description")}
          description="A assistente de IA usa isso para explicar o serviço ao cliente."
        />
        <div className="flex flex-col gap-2">
          <span className="text-body font-medium">Quem atende este serviço</span>
          <p className="text-small text-muted-foreground">
            Nenhum selecionado = qualquer profissional ativo pode ser escolhido ao agendar.
          </p>
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            {professionals.length === 0 ? (
              <p className="text-small text-muted-foreground">Nenhum membro da equipe cadastrado ainda.</p>
            ) : (
              professionals.map((professional) => (
                <label key={professional.userId} className="flex items-center gap-2 text-body">
                  <Checkbox
                    checked={selectedProfessionals.has(professional.userId)}
                    onCheckedChange={(checked) => toggleProfessional(professional.userId, checked === true)}
                  />
                  {professional.fullName}
                </label>
              ))
            )}
          </div>
        </div>
        <TextareaField
          label="Restrições (opcional)"
          name="restrictions"
          rows={3}
          maxLength={1000}
          defaultValue={pick("restrictions", service?.restrictions)}
          error={fieldError(state, "restrictions")}
          description="Ex.: não recomendado para gestantes. A IA leva isso em conta ao conversar com o cliente."
        />
        <SwitchField
          label="Exige confirmação humana antes de agendar"
          name="requiresHumanConfirmation"
          defaultChecked={service?.requiresHumanConfirmation ?? false}
          description="A IA nunca finaliza esse agendamento sozinha na primeira vez — escala para um atendente confirmar antes."
        />
        {service && <SwitchField label="Serviço ativo" name="isActive" defaultChecked={service.isActive} />}
      </DialogFormLayout>
    </form>
  );
}
