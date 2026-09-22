"use client";

import { useRouter } from "next/navigation";
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
import { CUSTOMER_ORIGINS } from "@/domains/customers/labels";
import { toDecimalInput } from "@/lib/decimal";
import { IDLE, type ActionState } from "@/lib/errors";
import { saveOpportunityAction } from "../actions";
import type { OpportunityField } from "../schemas";
import { ProductPicker, type PickedProduct } from "./product-picker";

const NONE = "__none__";

export interface ResponsibleOption {
  userId: string;
  fullName: string;
}

export interface OpportunityFormValues {
  id: string;
  customer: CustomerOption;
  title: string | null;
  estimatedValue: number | null;
  responsibleUserId: string | null;
  origin: string | null;
  notes: string | null;
  expectedAt: string | null;
  products: PickedProduct[];
}

export function OpportunityFormSheet({
  trigger,
  opportunity,
  presetCustomer,
  responsibles,
}: {
  trigger: React.ReactNode;
  opportunity?: OpportunityFormValues;
  presetCustomer?: CustomerOption;
  responsibles: ResponsibleOption[];
}) {
  return (
    <FormSheet
      trigger={trigger}
      size="lg"
      title={opportunity ? "Editar oportunidade" : "Nova oportunidade"}
      description={opportunity ? (opportunity.title ?? opportunity.customer.name) : "Registre o interesse do cliente."}
    >
      {(close) => (
        <OpportunityForm
          opportunity={opportunity}
          presetCustomer={presetCustomer}
          responsibles={responsibles}
          onDone={close}
        />
      )}
    </FormSheet>
  );
}

function OpportunityForm({
  opportunity,
  presetCustomer,
  responsibles,
  onDone,
}: {
  opportunity?: OpportunityFormValues;
  presetCustomer?: CustomerOption;
  responsibles: ResponsibleOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState<ActionState<OpportunityField>, FormData>(saveOpportunityAction, IDLE);
  const values = state.status === "error" ? state.values : undefined;
  const pick = (field: OpportunityField, fallback: string | null | undefined) =>
    values?.[field] ?? fallback ?? undefined;

  const [customer, setCustomer] = useState<CustomerOption | null>(opportunity?.customer ?? presetCustomer ?? null);
  const [products, setProducts] = useState<PickedProduct[]>(opportunity?.products ?? []);

  useActionFeedback(state, {
    onSuccess: (result) => {
      onDone();
      if (!opportunity) router.refresh();
      if (result.id) router.push(customer ? `/app/clientes/${customer.id}?aba=oportunidades` : "/app/crm");
    },
  });

  const responsibleOptions = [
    { value: NONE, label: "Sem responsável" },
    ...responsibles.map((item) => ({ value: item.userId, label: item.fullName })),
  ];
  const originOptions = [{ value: NONE, label: "Não informado" }, ...CUSTOMER_ORIGINS];

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col" noValidate>
      {opportunity && <input type="hidden" name="id" value={opportunity.id} />}
      <input type="hidden" name="customerId" value={customer?.id ?? ""} />
      <input type="hidden" name="variantIds" value={JSON.stringify(products.map((p) => p.variantId))} />
      <SheetFormLayout
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <SubmitButton pendingLabel="Salvando…" disabled={!customer}>
              {opportunity ? "Salvar alterações" : "Criar oportunidade"}
            </SubmitButton>
          </>
        }
      >
        <FormMessage state={state.status === "error" ? state : IDLE} />

        {presetCustomer || opportunity ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-body font-medium">Cliente</span>
            <p className="text-body text-muted-foreground">{customer?.name}</p>
          </div>
        ) : (
          <CustomerPicker value={customer} onChange={setCustomer} error={fieldError(state, "customerId")} />
        )}

        <TextField
          label="Interesse"
          name="title"
          placeholder="Ex.: Whey chocolate 900g"
          defaultValue={pick("title", opportunity?.title)}
          error={fieldError(state, "title")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Valor estimado"
            name="estimatedValue"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={pick("estimatedValue", toDecimalInput(opportunity?.estimatedValue))}
            error={fieldError(state, "estimatedValue")}
          />
          <TextField
            label="Previsão"
            name="expectedAt"
            type="date"
            defaultValue={pick("expectedAt", opportunity?.expectedAt)}
            error={fieldError(state, "expectedAt")}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Origem"
            name="origin"
            options={originOptions}
            defaultValue={pick("origin", opportunity?.origin) ?? NONE}
            error={fieldError(state, "origin")}
          />
          <SelectField
            label="Responsável"
            name="responsibleUserId"
            options={responsibleOptions}
            defaultValue={pick("responsibleUserId", opportunity?.responsibleUserId) ?? NONE}
            error={fieldError(state, "responsibleUserId")}
          />
        </div>
        <TextareaField
          label="Notas"
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={pick("notes", opportunity?.notes)}
          error={fieldError(state, "notes")}
        />

        <section className="flex flex-col gap-2 border-t border-border pt-5">
          <h3 className="text-body font-semibold">Produtos de interesse</h3>
          <ProductPicker selected={products} onChange={setProducts} />
        </section>
      </SheetFormLayout>
    </form>
  );
}
