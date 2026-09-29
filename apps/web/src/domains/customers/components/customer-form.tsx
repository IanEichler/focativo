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
import { CustomerAddressFields } from "./customer-address-fields";

const NONE = "__none__";

export interface CustomerFormValues {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  document: string | null;
  birthday: string | null;
  rg?: string | null;
  profession?: string | null;
  address?: string | null;
  city_state?: string | null;
  postal_code?: string | null;
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
        <MaskedTextField
          label="WhatsApp"
          name="whatsapp"
          required={!customer}
          inputMode="tel"
          placeholder="(66) 99999-9999"
          description="Número usado para contato e atendimento pelo WhatsApp."
          mask={maskPhone}
          defaultValue={pick("whatsapp", customer?.whatsapp || customer?.phone) as string | undefined}
          error={fieldError(state, "whatsapp")}
        />
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
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="RG" name="rg" defaultValue={pick("rg", customer?.rg)} error={fieldError(state, "rg")} />
          <TextField
            label="Profissão"
            name="profession"
            defaultValue={pick("profession", customer?.profession)}
            error={fieldError(state, "profession")}
          />
        </div>
        <CustomerAddressFields
          initialValues={{
            postal_code: pick("postal_code", customer?.postal_code) as string | undefined,
            address: pick("address", customer?.address) as string | undefined,
            city_state: pick("city_state", customer?.city_state) as string | undefined,
          }}
          errors={{
            postal_code: fieldError(state, "postal_code"),
            address: fieldError(state, "address"),
            city_state: fieldError(state, "city_state"),
          }}
        />
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
