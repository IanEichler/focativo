"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  advanceReservationAction,
  cancelReservationAction,
  completeReservationAction,
} from "@/domains/reservations/actions";
import { PAYMENT_METHODS } from "@/domains/sales/labels";
import type { Enums } from "@/types/database.types";

export function ReservationActions({
  reservationId,
  customerId,
  status,
}: {
  reservationId: string;
  customerId: string;
  status: Enums<"reservation_status">;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [paidAmount, setPaidAmount] = useState("");

  if (status === "COMPLETED" || status === "CANCELED" || status === "EXPIRED") return null;

  function advance(next: "CONFIRMED" | "AWAITING_PICKUP") {
    startTransition(async () => {
      const result = await advanceReservationAction(reservationId, next, customerId);
      if (result.status === "error") toast.error(result.message);
      else router.refresh();
    });
  }

  function complete() {
    startTransition(async () => {
      const result = await completeReservationAction(reservationId, customerId, {
        paymentMethod: paymentMethod || undefined,
        paidAmount: paidAmount ? Number(paidAmount.replace(",", ".")) : undefined,
      });
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      setCompleteOpen(false);
      toast.success(result.message);
      if (result.id) router.push(`/app/vendas/${result.id}`);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "PENDING" && (
        <Button variant="outline" disabled={pending} onClick={() => advance("CONFIRMED")}>
          Confirmar
        </Button>
      )}
      {status === "CONFIRMED" && (
        <Button variant="outline" disabled={pending} onClick={() => advance("AWAITING_PICKUP")}>
          Aguardando retirada
        </Button>
      )}
      <Button disabled={pending} onClick={() => setCompleteOpen(true)}>
        Converter em venda
      </Button>
      <Button variant="outline" className="text-danger" disabled={pending} onClick={() => setCancelOpen(true)}>
        Cancelar reserva
      </Button>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar esta reserva?"
        description="O estoque reservado será liberado imediatamente."
        confirmLabel="Cancelar reserva"
        destructive
        onConfirm={() => cancelReservationAction(reservationId, customerId)}
        onSuccess={() => router.refresh()}
      />

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Converter em venda</DialogTitle>
            <DialogDescription>Confirma o pagamento para concluir a reserva como venda.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Valor pago</Label>
              <Input
                value={paidAmount}
                onChange={(event) => setPaidAmount(event.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompleteOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={pending} onClick={complete}>
              Confirmar venda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
