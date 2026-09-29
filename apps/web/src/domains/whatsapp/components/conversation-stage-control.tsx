"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { moveOpportunityAction } from "@/domains/crm/actions";
import type { OpportunityCard, StageOption } from "@/domains/crm/queries";

export function ConversationStageControl({
  opportunities,
  stages,
  canWrite,
}: {
  opportunities: OpportunityCard[];
  stages: StageOption[];
  canWrite: boolean;
}) {
  const [selectedId, setSelectedId] = useState(opportunities[0]?.id);
  const [pending, startTransition] = useTransition();
  const [pendingLoss, setPendingLoss] = useState<{ opportunity: OpportunityCard; stageId: string } | null>(null);
  const [lostReason, setLostReason] = useState("");
  const opportunity = opportunities.find((item) => item.id === selectedId) ?? opportunities[0];
  const currentStage = stages.find((stage) => stage.id === opportunity?.stageId);

  function move(item: OpportunityCard, stageId: string, reason?: string) {
    startTransition(async () => {
      try {
        const result = await moveOpportunityAction(item.id, stageId, item.customerId, reason);
        if (result.status === "error") {
          toast.error(result.message);
          return;
        }
        setPendingLoss(null);
        toast.success("Fase atualizada.");
      } catch {
        toast.error("Não foi possível mudar a fase. Tente novamente.");
      }
    });
  }

  if (!opportunity) {
    return (
      <p className="shrink-0 border-b border-border px-4 py-2 text-small text-muted-foreground">
        Sem oportunidade no CRM para esta cliente.
      </p>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2" aria-busy={pending}>
      {opportunities.length > 1 ? (
        <Select value={opportunity.id} onValueChange={setSelectedId} disabled={pending}>
          <SelectTrigger aria-label="Oportunidade da cliente" className="w-full min-w-0 sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opportunities.map((item, index) => (
              <SelectItem key={item.id} value={item.id}>
                {item.title ?? `Oportunidade ${index + 1}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="max-w-48 truncate text-small text-muted-foreground" title={opportunity.title ?? undefined}>
          {opportunity.title ?? "Oportunidade"}
        </span>
      )}
      <span className="text-small font-medium">Fase:</span>
      {canWrite ? (
        <Select
          value={opportunity.stageId}
          disabled={pending || stages.length === 0}
          onValueChange={(stageId) => {
            if (stageId === opportunity.stageId) return;
            const stage = stages.find((item) => item.id === stageId);
            if (!stage) return;
            if (stage.isLost) {
              setLostReason("");
              setPendingLoss({ opportunity, stageId });
            } else {
              move(opportunity, stageId);
            }
          }}
        >
          <SelectTrigger aria-label="Fase no CRM" className="w-auto max-w-full min-w-40">
            <SelectValue placeholder="Selecionar fase" />
          </SelectTrigger>
          <SelectContent>
            {!currentStage && (
              <SelectItem value={opportunity.stageId} disabled>
                Fase inativa
              </SelectItem>
            )}
            {stages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                {stage.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-small">{currentStage?.name ?? "Fase inativa"}</span>
      )}
      {pending && (
        <span role="status" className="text-small text-muted-foreground">
          Salvando…
        </span>
      )}

      <Dialog
        open={pendingLoss !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setPendingLoss(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como perdida</DialogTitle>
            <DialogDescription>Você pode registrar o motivo da perda desta oportunidade.</DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Motivo da perda (opcional)"
            placeholder="Motivo da perda (opcional)"
            value={lostReason}
            onChange={(event) => setLostReason(event.target.value)}
            maxLength={500}
            rows={3}
            disabled={pending}
          />
          <DialogFooter>
            <Button variant="ghost" disabled={pending} onClick={() => setPendingLoss(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (pendingLoss) move(pendingLoss.opportunity, pendingLoss.stageId, lostReason);
              }}
            >
              {pending ? "Salvando…" : "Confirmar perda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
