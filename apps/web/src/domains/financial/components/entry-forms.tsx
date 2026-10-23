"use client";

import { Ban, CircleCheck, MoreHorizontal, Pencil, Plus, Undo2 } from "lucide-react";
import { useActionState, useState } from "react";
import { TextareaField } from "@/components/forms/fields";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { DialogFormLayout, FormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContractPaymentField } from "@/domains/documents/components/contract-payment-field";
import { CustomerPicker } from "@/domains/customers/components/customer-picker";
import type { CustomerOption } from "@/domains/customers/queries";
import { toDecimalInput } from "@/lib/decimal";
import { IDLE, type ActionState } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import {
  cancelEntryAction,
  createEntryAction,
  payEntryAction,
  reverseEntryPaymentAction,
  updateEntryAction,
} from "../actions";
import type { FinancialEntryRow } from "../queries";
import type { CreateEntryField, PayEntryField, UpdateEntryField } from "../schemas";

export function installmentLabel(entry: Pick<FinancialEntryRow, "installmentNumber" | "installmentCount">) {
  return entry.installmentCount > 1 ? `Parcela ${entry.installmentNumber}/${entry.installmentCount}` : "Parcela única";
}

/** Sem `customerId` (tela Financeiro), o formulário pede a cliente. */
export function NewEntryDialog({ customerId, today }: { customerId?: string; today: string }) {
  return (
    <FormDialog
      title="Novo lançamento"
      description="Valor a receber desta cliente: sessão avulsa, contrato antigo ou ajuste."
      trigger={
        <Button>
          <Plus /> Novo lançamento
        </Button>
      }
    >
      {(close) => <NewEntryForm customerId={customerId} today={today} onDone={close} />}
    </FormDialog>
  );
}

function NewEntryForm({ customerId, today, onDone }: { customerId?: string; today: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState<CreateEntryField>, FormData>(createEntryAction, IDLE);
  const values = state.status === "error" ? state.values : undefined;
  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  useActionFeedback(state, { onSuccess: onDone });

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl" noValidate>
      <input type="hidden" name="customerId" value={customerId ?? customer?.id ?? ""} />
      <DialogFormLayout
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <SubmitButton pendingLabel="Lançando…">Lançar</SubmitButton>
          </>
        }
      >
        <FormMessage state={state.status === "error" ? state : IDLE} />
        {!customerId && <CustomerPicker value={customer} onChange={setCustomer} error={fieldError(state, "customerId")} />}
        <TextField
          label="Descrição"
          name="description"
          required
          placeholder="Ex.: Pacote facial, sessão avulsa de laser"
          defaultValue={values?.description}
          error={fieldError(state, "description")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Valor total"
            name="total"
            required
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={values?.total}
            error={fieldError(state, "total")}
          />
          <TextField
            label="Número de parcelas"
            name="installments"
            required
            inputMode="numeric"
            defaultValue={values?.installments ?? "1"}
            error={fieldError(state, "installments")}
            description="Uma por mês, a partir do 1º vencimento."
          />
        </div>
        <TextField
          label="1º vencimento"
          name="firstDueDate"
          type="date"
          required
          defaultValue={values?.firstDueDate ?? today}
          error={fieldError(state, "firstDueDate")}
        />
        <ContractPaymentField name="paymentMethod" defaultValue={values?.paymentMethod} />
        <TextareaField
          label="Observações"
          name="notes"
          rows={2}
          maxLength={1000}
          defaultValue={values?.notes}
          error={fieldError(state, "notes")}
        />
      </DialogFormLayout>
    </form>
  );
}

export function EntryActions({
  entry,
  customerId,
  today,
}: {
  entry: FinancialEntryRow;
  customerId?: string;
  today: string;
}) {
  const [dialog, setDialog] = useState<"pay" | "edit" | "reverse" | "cancel" | null>(null);
  const close = () => setDialog(null);
  const name = `${entry.description} · ${installmentLabel(entry)}`;
  if (entry.status === "CANCELED") return null;

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        {entry.status === "PENDING" && (
          <Button size="sm" variant="outline" onClick={() => setDialog("pay")}>
            <CircleCheck /> Marcar como pago
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Mais ações para ${name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {entry.status === "PENDING" ? (
              <>
                <DropdownMenuItem onSelect={() => setDialog("edit")}>
                  <Pencil /> Editar parcela
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog("cancel")}>
                  <Ban /> Cancelar parcela
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onSelect={() => setDialog("reverse")}>
                <Undo2 /> Estornar pagamento
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <FormDialog
        title="Registrar pagamento"
        description={`${name} · ${formatMoney(entry.amount)}`}
        open={dialog === "pay"}
        onOpenChange={(open) => !open && close()}
      >
        {() => <PayEntryForm entry={entry} customerId={customerId} today={today} onDone={close} />}
      </FormDialog>
      <FormDialog title="Editar parcela" description={name} open={dialog === "edit"} onOpenChange={(open) => !open && close()}>
        {() => <EditEntryForm entry={entry} customerId={customerId} onDone={close} />}
      </FormDialog>
      <ConfirmDialog
        open={dialog === "reverse"}
        onOpenChange={(open) => !open && close()}
        title="Estornar pagamento?"
        description={`${name} volta a ficar em aberto. O estorno fica registrado no histórico da cliente.`}
        confirmLabel="Estornar"
        onConfirm={() => reverseEntryPaymentAction(entry.id, customerId ?? entry.customerId)}
      />
      <ConfirmDialog
        open={dialog === "cancel"}
        onOpenChange={(open) => !open && close()}
        title="Cancelar parcela?"
        description={`${name} deixa de ser cobrada e sai dos totais. Não dá para desfazer; se precisar, lance um novo valor.`}
        confirmLabel="Cancelar parcela"
        destructive
        onConfirm={() => cancelEntryAction(entry.id, customerId ?? entry.customerId)}
      />
    </>
  );
}

function PayEntryForm({
  entry,
  customerId,
  today,
  onDone,
}: {
  entry: FinancialEntryRow;
  customerId?: string;
  today: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState<PayEntryField>, FormData>(payEntryAction, IDLE);
  const values = state.status === "error" ? state.values : undefined;
  useActionFeedback(state, { onSuccess: onDone });

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl" noValidate>
      <input type="hidden" name="entryId" value={entry.id} />
      <input type="hidden" name="customerId" value={customerId ?? entry.customerId ?? ""} />
      <DialogFormLayout
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <SubmitButton pendingLabel="Salvando…">Confirmar pagamento</SubmitButton>
          </>
        }
      >
        <FormMessage state={state.status === "error" ? state : IDLE} />
        <TextField
          label="Data do pagamento"
          name="paidAt"
          type="date"
          required
          max={today}
          defaultValue={values?.paidAt ?? today}
          error={fieldError(state, "paidAt")}
        />
        <ContractPaymentField name="paymentMethod" defaultValue={values?.paymentMethod ?? entry.paymentMethod ?? ""} />
      </DialogFormLayout>
    </form>
  );
}

function EditEntryForm({ entry, customerId, onDone }: { entry: FinancialEntryRow; customerId?: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState<UpdateEntryField>, FormData>(updateEntryAction, IDLE);
  const values = state.status === "error" ? state.values : undefined;
  useActionFeedback(state, { onSuccess: onDone });

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl" noValidate>
      <input type="hidden" name="entryId" value={entry.id} />
      <input type="hidden" name="customerId" value={customerId ?? entry.customerId ?? ""} />
      <DialogFormLayout
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <SubmitButton pendingLabel="Salvando…">Salvar</SubmitButton>
          </>
        }
      >
        <FormMessage state={state.status === "error" ? state : IDLE} />
        <TextField
          label="Descrição"
          name="description"
          required
          defaultValue={values?.description ?? entry.description}
          error={fieldError(state, "description")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Valor"
            name="amount"
            required
            inputMode="decimal"
            defaultValue={values?.amount ?? toDecimalInput(entry.amount)}
            error={fieldError(state, "amount")}
          />
          <TextField
            label="Vencimento"
            name="dueDate"
            type="date"
            required
            defaultValue={values?.dueDate ?? entry.dueDate}
            error={fieldError(state, "dueDate")}
          />
        </div>
        <ContractPaymentField name="paymentMethod" defaultValue={values?.paymentMethod ?? entry.paymentMethod ?? ""} />
      </DialogFormLayout>
    </form>
  );
}
