"use client";

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { KanbanCard, KanbanColumn } from "@/components/data/kanban";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { originLabel } from "@/domains/customers/labels";
import { formatMoney, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { moveOpportunityAction } from "../actions";
import { OpportunityFormSheet, type ResponsibleOption } from "./opportunity-form";
import type { OpportunityCard, StageOption } from "../queries";

function DraggableCard({ card, disabled }: { card: OpportunityCard; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id, disabled });
  return (
    <Link href={`/app/clientes/${card.customerId}?aba=oportunidades`} className="block">
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined}
        className={cn("touch-none", isDragging && "opacity-50")}
      >
        <KanbanCard
          customer={card.customerName}
          interest={card.title ?? "Sem descrição"}
          value={card.estimatedValue !== null ? formatMoney(card.estimatedValue) : "—"}
          origin={originLabel(card.origin)}
          lastInteraction={formatRelative(card.updatedAt)}
          className="cursor-grab active:cursor-grabbing"
        />
      </div>
    </Link>
  );
}

function DroppableColumn({ stage, children }: { stage: StageOption; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div ref={setNodeRef}>
      <KanbanColumn title={stage.name} count={0} className={cn(isOver && "ring-2 ring-ring")}>
        {children}
      </KanbanColumn>
    </div>
  );
}

export function CrmBoard({
  stages,
  initialCards,
  canWrite,
  responsibles,
}: {
  stages: StageOption[];
  initialCards: OpportunityCard[];
  canWrite: boolean;
  responsibles: ResponsibleOption[];
}) {
  const [cards, setCards] = useState(initialCards);
  const [pendingLoss, setPendingLoss] = useState<{ opportunityId: string; customerId: string; stageId: string } | null>(
    null,
  );
  const [lostReason, setLostReason] = useState("");
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function applyMove(opportunityId: string, stageId: string, customerId: string, reason?: string) {
    const previous = cards;
    setCards((current) => current.map((card) => (card.id === opportunityId ? { ...card, stageId } : card)));
    startTransition(async () => {
      const result = await moveOpportunityAction(opportunityId, stageId, customerId, reason);
      if (result.status === "error") {
        setCards(previous);
        toast.error(result.message);
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!canWrite || !event.over) return;
    const opportunityId = String(event.active.id);
    const stageId = String(event.over.id);
    const card = cards.find((c) => c.id === opportunityId);
    const targetStage = stages.find((s) => s.id === stageId);
    if (!card || !targetStage || card.stageId === stageId) return;

    if (targetStage.isLost) {
      setPendingLoss({ opportunityId, customerId: card.customerId, stageId });
      setLostReason("");
      return;
    }
    applyMove(opportunityId, stageId, card.customerId);
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const stageCards = cards.filter((card) => card.stageId === stage.id);
            return (
              <DroppableColumn key={stage.id} stage={stage}>
                {stageCards.length === 0 ? (
                  <p className="px-2 py-3 text-center text-caption text-muted-foreground">Nenhuma oportunidade</p>
                ) : (
                  stageCards.map((card) => <DraggableCard key={card.id} card={card} disabled={!canWrite} />)
                )}
                {stage.code === "novo" && canWrite && (
                  <OpportunityFormSheet
                    responsibles={responsibles}
                    trigger={
                      <Button variant="ghost" size="sm" className="justify-start text-muted-foreground">
                        + Nova oportunidade
                      </Button>
                    }
                  />
                )}
              </DroppableColumn>
            );
          })}
        </div>
      </DndContext>

      <Dialog open={pendingLoss !== null} onOpenChange={(open) => !open && setPendingLoss(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como perdida</DialogTitle>
            <DialogDescription>Registrar o motivo ajuda a entender o funil (opcional).</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Ex.: comprou em outra loja, preço, desistiu…"
            value={lostReason}
            onChange={(event) => setLostReason(event.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingLoss(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingLoss)
                  applyMove(pendingLoss.opportunityId, pendingLoss.stageId, pendingLoss.customerId, lostReason);
                setPendingLoss(null);
              }}
            >
              Confirmar perda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
