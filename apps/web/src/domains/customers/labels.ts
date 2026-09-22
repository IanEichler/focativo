export const CUSTOMER_ORIGINS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "indicacao", label: "Indicação" },
  { value: "loja", label: "Loja física" },
  { value: "site", label: "Site" },
  { value: "outro", label: "Outro" },
] as const;

const ORIGIN_LABELS = new Map<string, string>(CUSTOMER_ORIGINS.map((item) => [item.value, item.label]));

export function originLabel(origin: string | null): string {
  if (!origin) return "Não informado";
  return ORIGIN_LABELS.get(origin) ?? origin;
}

export const TIMELINE_EVENT_LABELS: Record<string, string> = {
  "customer.created": "Cliente cadastrado",
  "crm.opportunity_created": "Oportunidade criada",
  "crm.opportunity_stage_changed": "Etapa alterada",
  "crm.opportunity_won": "Oportunidade ganha",
  "crm.opportunity_lost": "Oportunidade perdida",
  "customer.note_added": "Nota adicionada",
};

export function timelineEventLabel(type: string): string {
  return TIMELINE_EVENT_LABELS[type] ?? type;
}
