"use client";

import { useActionState, useState } from "react";
import { TextareaField } from "@/components/forms/fields";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { FormSheet, SheetFormLayout } from "@/components/forms/form-sheet";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { Button } from "@/components/ui/button";
import { CustomerPicker } from "@/domains/customers/components/customer-picker";
import type { CustomerOption } from "@/domains/customers/queries";
import { IDLE, type ActionState } from "@/lib/errors";
import { formatMoney, formatQuantity } from "@/lib/format";
import { createAppointmentAction } from "../actions";
import type { AppointmentField } from "../schemas";
import type { ProfessionalOption, ServiceRow } from "../queries";

export function AppointmentFormSheet({
  trigger,
  services,
  professionals,
  presetCustomer,
}: {
  trigger: React.ReactNode;
  services: ServiceRow[];
  professionals: ProfessionalOption[];
  presetCustomer?: CustomerOption;
}) {
  return (
    <FormSheet
      trigger={trigger}
      size="lg"
      title="Novo agendamento"
      description="Escolha o cliente, o serviço e o horário."
    >
      {(close) => (
        <AppointmentForm
          services={services}
          professionals={professionals}
          presetCustomer={presetCustomer}
          onDone={close}
        />
      )}
    </FormSheet>
  );
}

function AppointmentForm({
  services,
  professionals,
  presetCustomer,
  onDone,
}: {
  services: ServiceRow[];
  professionals: ProfessionalOption[];
  presetCustomer?: CustomerOption;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState<AppointmentField>, FormData>(createAppointmentAction, IDLE);
  const [customer, setCustomer] = useState<CustomerOption | null>(presetCustomer ?? null);
  const [serviceId, setServiceId] = useState<string | undefined>(undefined);

  useActionFeedback(state, { onSuccess: onDone });

  const serviceOptions = services
    .filter((s) => s.isActive)
    .map((s) => ({
      value: s.id,
      label: `${s.name} — ${formatQuantity(s.durationMinutes, "min")} — ${formatMoney(s.price)}`,
    }));

  // Serviço sem restrição (professionalUserIds vazio) aceita qualquer
  // profissional ativo — mesmo "default aberto" da RPC.
  const selectedService = services.find((s) => s.id === serviceId);
  const eligibleProfessionals =
    selectedService && selectedService.professionalUserIds.length > 0
      ? professionals.filter((p) => selectedService.professionalUserIds.includes(p.userId))
      : professionals;
  const professionalOptions = eligibleProfessionals.map((p) => ({ value: p.userId, label: p.fullName }));

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col" noValidate>
      <input type="hidden" name="customerId" value={customer?.id ?? ""} />
      <SheetFormLayout
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <SubmitButton pendingLabel="Agendando…" disabled={!customer}>
              Criar agendamento
            </SubmitButton>
          </>
        }
      >
        <FormMessage state={state.status === "error" ? state : IDLE} />

        {presetCustomer ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-body font-medium">Cliente</span>
            <p className="text-body text-muted-foreground">{customer?.name}</p>
          </div>
        ) : (
          <CustomerPicker value={customer} onChange={setCustomer} error={fieldError(state, "customerId")} />
        )}

        <SelectField
          label="Serviço"
          name="serviceId"
          options={serviceOptions}
          error={fieldError(state, "serviceId")}
          onValueChange={setServiceId}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            key={serviceId}
            label="Profissional"
            name="professionalUserId"
            options={professionalOptions}
            error={fieldError(state, "professionalUserId")}
            description={
              selectedService && selectedService.professionalUserIds.length > 0
                ? "Só os profissionais habilitados para este serviço aparecem aqui."
                : undefined
            }
          />
          <TextField
            label="Data e horário"
            name="startsAt"
            type="datetime-local"
            error={fieldError(state, "startsAt")}
          />
        </div>
        <TextareaField label="Observações" name="notes" rows={2} maxLength={1000} error={fieldError(state, "notes")} />
      </SheetFormLayout>
    </form>
  );
}
