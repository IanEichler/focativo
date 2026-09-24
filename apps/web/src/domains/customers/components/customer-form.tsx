"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { TextareaField } from "@/components/forms/fields";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { DialogFormLayout, FormDialog } from "@/components/forms/form-dialog";
import { MaskedTextField } from "@/components/forms/masked-text-field";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { Button } from "@/components/ui/button";
import { IDLE, type ActionState } from "@/lib/errors";
import { maskCpfCnpj, maskPhone } from "@/lib/masks";
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
}

export function CustomerFormSheet({ trigger, customer }: { trigger: React.ReactNode; customer?: CustomerFormValues }) {
  return (
    <FormDialog
      trigger={trigger}
      title={customer ? "Editar cliente" : "Novo cliente"}
      description={customer ? customer.name : "Cadastre o cliente para começar o atendimento."}
    >
      {(close) => <CustomerForm customer={customer} onDone={close} />}
    </FormDialog>
  );
}

function CustomerForm({ customer, onDone }: { customer?: CustomerFormValues; onDone: () => void }) {
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

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col" noValidate>
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <DialogFormLayout
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
          <MaskedTextField
            label="Telefone"
            name="phone"
            required
            inputMode="numeric"
            placeholder="(11) 98888-7777"
            mask={maskPhone}
            defaultValue={pick("phone", customer?.phone) as string | undefined}
            error={fieldError(state, "phone")}
          />
          <MaskedTextField
            label="WhatsApp"
            name="whatsapp"
            inputMode="numeric"
            placeholder="(11) 98888-7777"
            description="Opcional — usado para reconhecer a conversa no WhatsApp"
            mask={maskPhone}
            defaultValue={pick("whatsapp", customer?.whatsapp) as string | undefined}
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
          <MaskedTextField
            label="CPF/CNPJ"
            name="document"
            inputMode="numeric"
            description="Opcional"
            mask={maskCpfCnpj}
            defaultValue={pick("document", customer?.document) as string | undefined}
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
        <SelectField
          label="Origem"
          name="origin"
          options={originOptions}
          defaultValue={pick("origin", customer?.origin) ?? NONE}
          error={fieldError(state, "origin")}
        />
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
      </DialogFormLayout>
    </form>
  );
}
