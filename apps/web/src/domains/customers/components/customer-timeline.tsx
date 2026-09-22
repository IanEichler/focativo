import { CircleCheck, CircleX, Kanban, MessageSquareText, UserPlus } from "lucide-react";
import { Timeline, type TimelineItem } from "@/components/data/timeline";
import { EmptyState } from "@/components/feedback/empty-state";
import { formatDateTime } from "@/lib/format";
import type { TimelineEventRow } from "../queries";

function iconFor(type: string) {
  if (type === "customer.created") return <UserPlus />;
  if (type === "crm.opportunity_won") return <CircleCheck />;
  if (type === "crm.opportunity_lost") return <CircleX />;
  if (type === "crm.opportunity_created" || type === "crm.opportunity_stage_changed") return <Kanban />;
  return <MessageSquareText />;
}

function toneFor(type: string): TimelineItem["tone"] {
  if (type === "crm.opportunity_won") return "brand";
  if (type === "crm.opportunity_lost") return "danger";
  if (type.startsWith("crm.")) return "info";
  return "neutral";
}

function describe(event: TimelineEventRow): React.ReactNode {
  const payload = event.payload;
  switch (event.type) {
    case "customer.created":
      return "O cliente entrou na base.";
    case "crm.opportunity_created":
      return payload.title ? `Interesse: ${String(payload.title)}` : "Nova oportunidade aberta.";
    case "crm.opportunity_stage_changed":
      return payload.to_stage_name ? `Movida para "${String(payload.to_stage_name)}".` : "Etapa alterada.";
    case "crm.opportunity_won":
      return "Negócio fechado.";
    case "crm.opportunity_lost":
      return payload.lost_reason ? `Motivo: ${String(payload.lost_reason)}` : "Oportunidade perdida.";
    default:
      return null;
  }
}

const ACTOR_LABEL: Record<TimelineEventRow["actorType"], string> = {
  USER: "",
  SYSTEM: "Sistema",
  AI: "IA",
  INTEGRATION: "Integração",
  PLATFORM_ADMIN: "Equipe da plataforma",
};

export function CustomerTimeline({
  events,
  labelFor,
}: {
  events: TimelineEventRow[];
  labelFor: (type: string) => string;
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        className="border-0"
        title="Sem atividade ainda"
        description="Ações do CRM e notas aparecerão aqui."
      />
    );
  }

  const items: TimelineItem[] = events.map((event) => {
    const actorLabel = event.actorName ?? ACTOR_LABEL[event.actorType];
    return {
      id: event.id,
      title: labelFor(event.type),
      description: (
        <span className="flex flex-col gap-0.5">
          {describe(event)}
          {actorLabel && <span className="text-caption text-subtle">{actorLabel}</span>}
        </span>
      ),
      timestamp: formatDateTime(event.occurredAt),
      icon: iconFor(event.type),
      tone: toneFor(event.type),
    };
  });

  return <Timeline items={items} />;
}
