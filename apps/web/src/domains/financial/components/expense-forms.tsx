"use client";

import { Plus, Repeat, X } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { TextareaField } from "@/components/forms/fields";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { DialogFormLayout, FormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { MoneyValue } from "@/components/data/money-value";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContractPaymentField } from "@/domains/documents/components/contract-payment-field";
import { IDLE, type ActionState } from "@/lib/errors";
import { createExpenseAction, endRecurringExpenseAction } from "../actions";
import type { RecurringExpenseRow } from "../queries";
import type { CreateExpenseField } from "../schemas";

export function NewExpenseDialog({ today, categories }: { today: string; categories: string[] }) {
  return (
    <FormDialog
      title="Nova despesa"
      description="Conta a pagar avulsa, parcelada ou fixa (repete todo mês)."
      trigger={
        <Button>
          <Plus /> Nova despesa
        </Button>
      }
    >
      {(close) => <NewExpenseForm today={today} categories={categories} onDone={close} />}
    </FormDialog>
  );
}

function NewExpenseForm({ today, categories, onDone }: { today: string; categories: string[]; onDone: () => void }) {
  const [state, action] = useActionState<ActionState<CreateExpenseField>, FormData>(createExpenseAction, IDLE);
  const values = state.status === "error" ? state.values : undefined;
  const [recurring, setRecurring] = useState(values?.recurring === "true");
  const categoryListId = useId();
  useActionFeedback(state, { onSuccess: onDone });

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl" noValidate>
      <input type="hidden" name="recurring" value={recurring ? "true" : "false"} />
      <DialogFormLayout
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <SubmitButton pendingLabel="Salvando…">{recurring ? "Criar despesa fixa" : "Lançar despesa"}</SubmitButton>
          </>
        }
      >
        <FormMessage state={state.status === "error" ? state : IDLE} />
        <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-body">
          <input
            type="checkbox"
            checked={recurring}
            onChange={(event) => setRecurring(event.target.checked)}
            className="mt-0.5 size-4"
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">Despesa fixa</span>
            <span className="text-small text-muted-foreground">
              Repete todo mês no mesmo dia (aluguel, luz, internet), até você encerrar.
            </span>
          </span>
        </label>
        <TextField
          label="Descrição"
          name="description"
          required
          placeholder={recurring ? "Ex.: Aluguel da sala" : "Ex.: Compra de produtos"}
          defaultValue={values?.description}
          error={fieldError(state, "description")}
        />
        <TextField
          label="Categoria"
          name="category"
          list={categoryListId}
          autoComplete="off"
          defaultValue={values?.category}
          error={fieldError(state, "category")}
          description="Escolha uma da lista ou digite uma nova."
        />
        <datalist id={categoryListId}>
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={recurring ? "Valor por mês" : "Valor total"}
            name="total"
            required
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={values?.total}
            error={fieldError(state, "total")}
          />
          {!recurring && (
            <TextField
              label="Número de parcelas"
              name="installments"
              required
              inputMode="numeric"
              defaultValue={values?.installments ?? "1"}
              error={fieldError(state, "installments")}
            />
          )}
        </div>
        <TextField
          label={recurring ? "1º vencimento" : "Vencimento (1ª parcela)"}
          name="firstDueDate"
          type="date"
          required
          defaultValue={values?.firstDueDate ?? today}
          error={fieldError(state, "firstDueDate")}
          description={recurring ? "As próximas vencem todo mês neste mesmo dia." : undefined}
        />
        <ContractPaymentField name="paymentMethod" defaultValue={values?.paymentMethod} />
        {!recurring && (
          <TextareaField
            label="Observações"
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={values?.notes}
            error={fieldError(state, "notes")}
          />
        )}
      </DialogFormLayout>
    </form>
  );
}

export function RecurringExpensesCard({ items, canWrite }: { items: RecurringExpenseRow[]; canWrite: boolean }) {
  const [ending, setEnding] = useState<RecurringExpenseRow | null>(null);
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="size-4" /> Despesas fixas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="flex flex-col">
                <span className="text-body font-medium">{item.description}</span>
                <span className="text-caption text-muted-foreground">
                  Todo dia {item.dayOfMonth}
                  {item.category ? ` · ${item.category}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <MoneyValue value={item.amount} />
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Encerrar ${item.description}`}
                    onClick={() => setEnding(item)}
                  >
                    <X />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
      <ConfirmDialog
        open={ending !== null}
        onOpenChange={(open) => !open && setEnding(null)}
        title="Encerrar despesa fixa?"
        description={
          ending
            ? `${ending.description} para de se repetir. A parcela deste mês continua na lista; as dos próximos meses são canceladas.`
            : ""
        }
        confirmLabel="Encerrar"
        destructive
        onConfirm={() => endRecurringExpenseAction(ending!.id)}
      />
    </Card>
  );
}
