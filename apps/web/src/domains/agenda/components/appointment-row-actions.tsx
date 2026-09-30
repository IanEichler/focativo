"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Check, CheckCheck, MoreHorizontal, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { ActionState } from "@/lib/errors";
import { advanceAppointmentAction, cancelAppointmentAction } from "../actions";
import type { AppointmentListItem } from "../queries";

export function AppointmentRowActions({ appointment }: { appointment: AppointmentListItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  function run(fn: () => Promise<ActionState>) {
    setOpen(false);
    startTransition(async () => {
      try {
        const result = await fn();
        if (result.status === "error") toast.error(result.message ?? "Não foi possível concluir a ação.");
        else if (result.status === "success" && result.message) toast.success(result.message);
        router.refresh();
      } catch {
        toast.error("Não foi possível atualizar o agendamento. Tente novamente.");
      }
    });
  }

  if (!["SCHEDULED", "CONFIRMED"].includes(appointment.status)) return null;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            aria-label={`Ações do agendamento de ${appointment.customerName}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {appointment.status === "SCHEDULED" && (
            <DropdownMenuItem onSelect={() => run(() => advanceAppointmentAction(appointment.id, "CONFIRMED"))}>
              <Check /> Confirmar
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => run(() => advanceAppointmentAction(appointment.id, "COMPLETED"))}>
            <CheckCheck /> Concluir
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => advanceAppointmentAction(appointment.id, "NO_SHOW"))}>
            <UserX /> Não compareceu
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              setOpen(false);
              setCancelOpen(true);
            }}
          >
            <Ban /> Cancelar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar agendamento?"
        description={`O horário de ${appointment.customerName} será liberado na agenda.`}
        confirmLabel="Cancelar agendamento"
        destructive
        onSuccess={() => router.refresh()}
        onConfirm={async () => {
          try {
            return await cancelAppointmentAction(appointment.id);
          } catch {
            return { status: "error", message: "Não foi possível cancelar. Tente novamente." };
          }
        }}
      />
    </>
  );
}
