import { addMonths } from "@/domains/financial/payment-plan";

export const SESSION_FREQUENCIES = [
  { value: "7", label: "Toda semana" },
  { value: "14", label: "A cada 2 semanas" },
  { value: "21", label: "A cada 3 semanas" },
  { value: "28", label: "A cada 4 semanas" },
  { value: "month", label: "Todo mês (mesmo dia)" },
] as const;
export type SessionFrequency = (typeof SESSION_FREQUENCIES)[number]["value"];

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Datas (AAAA-MM-DD) das sessões a partir da 1ª, no intervalo escolhido. */
export function sessionDates(first: string, frequency: SessionFrequency, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    frequency === "month" ? addMonths(first, index) : addDays(first, index * Number(frequency)),
  );
}
