"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { TextareaField } from "@/components/forms/fields";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { FormSheet, SheetFormLayout } from "@/components/forms/form-sheet";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { Button } from "@/components/ui/button";
import { IDLE, type ActionState } from "@/lib/errors";
import { saveCustomerAction } from "../actions";
import { CUSTOMER_ORIGINS } from "../labels";
import type { CustomerField } from "../schemas";

const NONE = "__none__";

export interface CustomerFormValues {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  document: string | null;
  birthday: string | null;
  notes: string | null;
  tags: string[];
  origin: string | null;
  responsibleUserId: string | null;
}

export interface ResponsibleOption {
  userId: string;
  fullName: string;
}

export function CustomerFormSheet({
  trigger,
  customer,
  responsibles,
}: {
  trigger: React.ReactNode;
  customer?: CustomerFormValues;
  responsibles: ResponsibleOption[];
}) {
  return (
    <FormSheet
      trigger={trigger}
      title={customer ? "Editar cliente" : "Novo cliente"}
      description={customer ? customer.name : "Cadastre o cliente para começar o atendimento."}
    >
      {(close) => <CustomerForm customer={customer} responsibles={responsibles} onDone={close} />}
    </FormSheet>
  );
}

function CustomerForm({
  customer,
  responsibles,
  onDone,
}: {
  customer?: CustomerFormValues;
  responsibles: ResponsibleOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState<ActionState<CustomerField>, FormData>(saveCustomerAction, IDLE);
  const values = state.status === "error" ? state.values : undefined;
  const pick = (field: CustomerField, fallback: string | null | undefined) => values?.[field] ?? fallback ?? undefined;

  useActionFeedback(state, {
    onSuccess: (result) => {
      onDone();
      if (!customer && result.id) router.push(`/app/clientes/${result.id}`);
    },
  });

  const originOptions = [{ value: NONE, label: "Não informado" }, ...CUSTOMER_ORIGINS];
  const responsibleOptions = [
    { value: NONE, label: "Sem responsável" },
    ...responsibles.map((item) => ({ value: item.userId, label: item.fullName })),
  ];

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col" noValidate>
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <SheetFormLayout
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <SubmitButton pendingLabel="Salvando…">{customer ? "Salvar alterações" : "Cadastrar cliente"}</SubmitButton>
          </>
        }
      >
        <FormMessage state={state.status === "error" ? state : IDLE} />

        <TextField
          label="Nome"
          name="name"
          required
          autoFocus
          placeholder="Nome completo"
          defaultValue={pick("name", customer?.name)}
          error={fieldError(state, "name")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Telefone"
            name="phone"
            inputMode="numeric"
            placeholder="11988887777"
            defaultValue={pick("phone", customer?.phone)}
            error={fieldError(state, "phone")}
          />
          <TextField
            label="WhatsApp"
            name="whatsapp"
            inputMode="numeric"
            placeholder="11988887777"
            description="Usado para reconhecer a conversa no WhatsApp"
            defaultValue={pick("whatsapp", customer?.whatsapp)}
            error={fieldError(state, "whatsapp")}
          />
        </div>
        <TextField
          label="E-mail"
          name="email"
          type="email"
          defaultValue={pick("email", customer?.email)}
          error={fieldError(state, "email")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="CPF/CNPJ"
            name="document"
            inputMode="numeric"
            description="Opcional"
            defaultValue={pick("document", customer?.document)}
            error={fieldError(state, "document")}
          />
          <TextField
            label="Aniversário"
            name="birthday"
            type="date"
            defaultValue={pick("birthday", customer?.birthday)}
            error={fieldError(state, "birthday")}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Origem"
            name="origin"
            options={originOptions}
            defaultValue={pick("origin", customer?.origin) ?? NONE}
            error={fieldError(state, "origin")}
          />
          <SelectField
            label="Responsável"
            name="responsibleUserId"
            options={responsibleOptions}
            defaultValue={pick("responsibleUserId", customer?.responsibleUserId) ?? NONE}
            error={fieldError(state, "responsibleUserId")}
          />
        </div>
        <TextField
          label="Tags"
          name="tags"
          placeholder="vip, atacado, aniversariante"
          description="Separe por vírgula."
          defaultValue={pick("tags", customer?.tags.join(", "))}
          error={fieldError(state, "tags")}
        />
        <TextareaField
          label="Observações"
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={pick("notes", customer?.notes)}
          error={fieldError(state, "notes")}
        />
      </SheetFormLayout>
    </form>
  );
}
