"use client";

import { CheckCircle2, FlaskConical, Plus, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { SelectField } from "@/components/forms/select-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/data/status-badge";
import { MoneyValue } from "@/components/data/money-value";
import { IDLE, type ActionState } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { cancelChargeAction, createChargeAction, simulatePaymentWebhookAction } from "../actions";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES } from "../labels";
import type { PaymentRow } from "../queries";
import type { CreateChargeField } from "../schemas";

const METHOD_OPTIONS = [
  { value: "pix", label: "PIX" },
  { value: "credit_card", label: "Cartão de crédito" },
  { value: "debit_card", label: "Cartão de débito" },
  { value: "other", label: "Outro" },
];

function CreateChargeDialog({ reservationId }: { reservationId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action] = useActionState<ActionState<CreateChargeField>, FormData>(createChargeAction, IDLE);

  useActionFeedback(state, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> Gerar cobrança
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action}>
          <input type="hidden" name="reservationId" value={reservationId} />
          <DialogHeader>
            <DialogTitle>Gerar cobrança</DialogTitle>
            <DialogDescription>
              Cria uma cobrança pendente para o valor da reserva. O cliente paga fora do sistema; a reserva vira venda
              quando o pagamento for confirmado.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <FormMessage state={state.status === "error" ? state : IDLE} />
            <SelectField
              label="Forma de pagamento"
              name="method"
              options={METHOD_OPTIONS}
              defaultValue="pix"
              error={fieldError(state, "method")}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <SubmitButton pendingLabel="Gerando…">Gerar cobrança</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PendingChargeActions({ paymentId, reservationId }: { paymentId: string; reservationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function simulate(event: "confirmed" | "failed") {
    startTransition(async () => {
      const result = await simulatePaymentWebhookAction(paymentId, reservationId, event);
      if (result.status === "error") toast.error(result.message);
      else {
        toast.success(result.message);
        router.refresh();
      }
    });
  }

  function cancel() {
    startTransition(async () => {
      const result = await cancelChargeAction(paymentId, reservationId);
      if (result.status === "error") toast.error(result.message);
      else {
        toast.success(result.message);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => simulate("confirmed")}>
        <CheckCircle2 className="text-success" /> Simular confirmação
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => simulate("failed")}>
        <XCircle className="text-danger" /> Simular falha
      </Button>
      <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={pending} onClick={cancel}>
        Cancelar cobrança
      </Button>
    </div>
  );
}

export function PaymentsSection({
  reservationId,
  payments,
  canWrite,
  reservationActive,
}: {
  reservationId: string;
  payments: PaymentRow[];
  canWrite: boolean;
  reservationActive: boolean;
}) {
  const hasPending = payments.some((p) => p.status === "PENDING");

  return (
    <div className="flex flex-col gap-3">
      {canWrite && reservationActive && !hasPending && <CreateChargeDialog reservationId={reservationId} />}

      {payments.length === 0 ? (
        <p className="text-small text-muted-foreground">Nenhuma cobrança gerada para esta reserva.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {payments.map((payment) => (
            <div key={payment.id} className="flex flex-col gap-2 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge tone={PAYMENT_STATUS_TONES[payment.status]}>
                    {PAYMENT_STATUS_LABELS[payment.status]}
                  </StatusBadge>
                  {payment.provider === "dev" && (
                    <Badge variant="outline" className="gap-1 text-caption text-warning">
                      <FlaskConical className="size-3" /> Ambiente de desenvolvimento
                    </Badge>
                  )}
                </div>
                <span className="text-body font-medium tabular">
                  <MoneyValue value={payment.amount} />
                </span>
              </div>
              <p className="text-caption text-muted-foreground">
                {formatDateTime(payment.createdAt)}
                {payment.confirmedAt && ` · confirmado em ${formatDateTime(payment.confirmedAt)}`}
                {payment.failedReason && ` · ${payment.failedReason}`}
              </p>
              {payment.status === "PENDING" && payment.instructions?.pixCode && (
                <p className="truncate rounded bg-secondary px-2 py-1 font-mono text-caption text-muted-foreground">
                  {payment.instructions.pixCode}
                </p>
              )}
              {canWrite && payment.status === "PENDING" && (
                <PendingChargeActions paymentId={payment.id} reservationId={reservationId} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
