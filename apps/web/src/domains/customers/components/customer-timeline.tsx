import { CircleCheck, CircleX, HandCoins, Kanban, MessageSquareText, UserPlus } from "lucide-react";
import { Timeline, type TimelineItem } from "@/components/data/timeline";
import { EmptyState } from "@/components/feedback/empty-state";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { TimelineEventRow } from "../queries";

function iconFor(type: string) {
  if (type === "customer.created") return <UserPlus />;
  if (type === "crm.opportunity_won") return <CircleCheck />;
  if (type === "crm.opportunity_lost") return <CircleX />;
  if (type === "crm.opportunity_created" || type === "crm.opportunity_stage_changed") return <Kanban />;
  if (type.startsWith("financial.")) return <HandCoins />;
  return <MessageSquareText />;
}

function toneFor(type: string): TimelineItem["tone"] {
  if (type === "crm.opportunity_won") return "brand";
  if (type === "crm.opportunity_lost") return "danger";
  if (type.startsWith("crm.")) return "info";
  if (type === "financial.entry_paid") return "brand";
  if (type === "financial.entry_canceled" || type === "financial.entry_payment_reversed") return "danger";
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
    case "financial.contract_installments_created":
      return `${String(payload.installments ?? "")} parcela(s) criadas com a assinatura do contrato.`;
    case "financial.entry_created":
      return `${String(payload.description ?? "")} · ${formatMoney(Number(payload.total ?? 0))} em ${String(payload.installments ?? 1)} parcela(s).`;
    case "financial.entry_paid":
      return `${String(payload.description ?? "")} (${String(payload.installment ?? "")}) · ${formatMoney(Number(payload.amount ?? 0))}`;
    case "financial.entry_payment_reversed":
    case "financial.entry_canceled":
      return `${String(payload.description ?? "")} · ${formatMoney(Number(payload.amount ?? 0))}`;
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
