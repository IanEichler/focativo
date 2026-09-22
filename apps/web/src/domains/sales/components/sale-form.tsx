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
import { IDLE, type ActionState } from "@/lib/errors";
import { createSaleAction } from "../actions";
import { PAYMENT_METHODS, SALE_ORIGINS } from "../labels";
import type { SaleField } from "../schemas";
import { Cart, type CartLine } from "./cart";

const NONE = "__none__";

export function SaleFormSheet({
  trigger,
  presetCustomer,
  presetOpportunityId,
  canDiscount,
}: {
  trigger: React.ReactNode;
  presetCustomer?: CustomerOption;
  presetOpportunityId?: string;
  canDiscount: boolean;
}) {
  return (
    <FormSheet trigger={trigger} size="lg" title="Nova venda" description="Monte o carrinho e finalize a venda.">
      {(close) => (
        <SaleForm
          presetCustomer={presetCustomer}
          presetOpportunityId={presetOpportunityId}
          canDiscount={canDiscount}
          onDone={close}
        />
      )}
    </FormSheet>
  );
}

function SaleForm({
  presetCustomer,
  presetOpportunityId,
  canDiscount,
  onDone,
}: {
  presetCustomer?: CustomerOption;
  presetOpportunityId?: string;
  canDiscount: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState<ActionState<SaleField>, FormData>(createSaleAction, IDLE);
  const [customer, setCustomer] = useState<CustomerOption | null>(presetCustomer ?? null);
  const [lines, setLines] = useState<CartLine[]>([]);

  useActionFeedback(state, {
    onSuccess: (result) => {
      onDone();
      if (result.id) router.push(`/app/vendas/${result.id}`);
    },
  });

  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const overAvailable = lines.some((line) => line.available !== null && line.quantity > line.available);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col" noValidate>
      <input type="hidden" name="customerId" value={customer?.id ?? ""} />
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })))}
      />
      {presetOpportunityId && <input type="hidden" name="opportunityId" value={presetOpportunityId} />}
      <SheetFormLayout
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <SubmitButton pendingLabel="Registrando…" disabled={lines.length === 0}>
              Finalizar venda
            </SubmitButton>
          </>
        }
      >
        <FormMessage state={state.status === "error" ? state : IDLE} />
        {overAvailable && (
          <FormMessage
            state={{ status: "error", message: "Alguma quantidade excede o disponível — ajuste antes de finalizar." }}
          />
        )}

        {presetCustomer ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-body font-medium">Cliente</span>
            <p className="text-body text-muted-foreground">{customer?.name}</p>
          </div>
        ) : (
          <CustomerPicker value={customer} onChange={setCustomer} error={fieldError(state, "customerId")} />
        )}

        <Cart lines={lines} onChange={setLines} />

        <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <SelectField
            label="Origem"
            name="origin"
            options={SALE_ORIGINS.map((item) => ({ value: item.value, label: item.label }))}
            defaultValue="BALCAO"
            error={fieldError(state, "origin")}
          />
          {canDiscount && (
            <TextField
              label="Desconto"
              name="discountAmount"
              inputMode="decimal"
              placeholder="0,00"
              description={`Subtotal: ${subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
              error={fieldError(state, "discountAmount")}
            />
          )}
          <SelectField
            label="Forma de pagamento"
            name="paymentMethod"
            options={[{ value: NONE, label: "Não informado" }, ...PAYMENT_METHODS]}
            defaultValue={NONE}
            error={fieldError(state, "paymentMethod")}
          />
          <TextField
            label="Valor pago"
            name="paidAmount"
            inputMode="decimal"
            placeholder="0,00"
            error={fieldError(state, "paidAmount")}
          />
        </div>
        <TextareaField label="Observações" name="notes" rows={2} maxLength={1000} error={fieldError(state, "notes")} />
      </SheetFormLayout>
    </form>
  );
}
