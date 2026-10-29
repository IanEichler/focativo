"use client";

import { Ban, CheckCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ActionState } from "@/lib/errors";
import { advanceAppointmentAction, cancelAppointmentAction } from "../actions";

/** Desfecho de um atendimento que já passou: concluído, falta ou cancelado, num clique. */
export function AppointmentQuickResolve({
  appointmentId,
  customerName,
}: {
  appointmentId: string;
  customerName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);

  function run(fn: () => Promise<ActionState>) {
    startTransition(async () => {
      try {
        const result = await fn();
        if (result.status === "error") toast.error(result.message ?? "Não foi possível atualizar o atendimento.");
        else if (result.status === "success" && result.message) toast.success(result.message);
        router.refresh();
      } catch {
        toast.error("Não foi possível atualizar o atendimento. Tente novamente.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pending && <Spinner />}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => advanceAppointmentAction(appointmentId, "COMPLETED"))}
      >
        <CheckCheck /> Concluído
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => advanceAppointmentAction(appointmentId, "NO_SHOW"))}
      >
        <UserX /> Faltou
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setCancelOpen(true)}>
        <Ban /> Cancelar
      </Button>
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar atendimento?"
        description={`O atendimento de ${customerName || "esta cliente"} fica como cancelado. Se havia cobrança em aberto, ela é cancelada.`}
        confirmLabel="Cancelar atendimento"
        destructive
        onConfirm={() => cancelAppointmentAction(appointmentId)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
