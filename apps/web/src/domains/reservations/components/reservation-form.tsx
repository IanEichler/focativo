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
import { Cart, type CartLine } from "@/domains/sales/components/cart";
import { CustomerPicker } from "@/domains/customers/components/customer-picker";
import type { CustomerOption } from "@/domains/customers/queries";
import { CUSTOMER_ORIGINS } from "@/domains/customers/labels";
import { IDLE, type ActionState } from "@/lib/errors";
import { createReservationAction } from "../actions";
import type { ReservationField } from "../schemas";

const NONE = "__none__";

export function ReservationFormSheet({
  trigger,
  presetCustomer,
}: {
  trigger: React.ReactNode;
  presetCustomer?: CustomerOption;
}) {
  return (
    <FormSheet
      trigger={trigger}
      size="lg"
      title="Nova reserva"
      description="Reserve produtos para o cliente sem baixar o estoque físico."
    >
      {(close) => <ReservationForm presetCustomer={presetCustomer} onDone={close} />}
    </FormSheet>
  );
}

function ReservationForm({ presetCustomer, onDone }: { presetCustomer?: CustomerOption; onDone: () => void }) {
  const router = useRouter();
  const [state, action] = useActionState<ActionState<ReservationField>, FormData>(createReservationAction, IDLE);
  const [customer, setCustomer] = useState<CustomerOption | null>(presetCustomer ?? null);
  const [lines, setLines] = useState<CartLine[]>([]);

  useActionFeedback(state, {
    onSuccess: (result) => {
      onDone();
      if (result.id) router.push(`/app/reservas/${result.id}`);
    },
  });

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col" noValidate>
      <input type="hidden" name="customerId" value={customer?.id ?? ""} />
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })))}
      />
      <SheetFormLayout
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <SubmitButton pendingLabel="Reservando…" disabled={!customer || lines.length === 0}>
              Criar reserva
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

        <Cart lines={lines} onChange={setLines} />

        <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <TextField label="Expira em" name="expiresAt" type="datetime-local" error={fieldError(state, "expiresAt")} />
          <SelectField
            label="Origem"
            name="origin"
            options={[{ value: NONE, label: "Não informado" }, ...CUSTOMER_ORIGINS]}
            defaultValue={NONE}
            error={fieldError(state, "origin")}
          />
        </div>
        <TextareaField label="Observações" name="notes" rows={2} maxLength={1000} error={fieldError(state, "notes")} />
      </SheetFormLayout>
    </form>
  );
}
