export const SALE_ORIGINS = [
  { value: "BALCAO", label: "Balcão" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "MANUAL", label: "Manual" },
  { value: "OTHER", label: "Outro" },
] as const;

const ORIGIN_LABELS = new Map<string, string>(SALE_ORIGINS.map((item) => [item.value, item.label]));

export function saleOriginLabel(origin: string): string {
  return ORIGIN_LABELS.get(origin) ?? origin;
}

export const PAYMENT_METHODS = [
  { value: "cash", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "credit_card", label: "Cartão de crédito" },
  { value: "debit_card", label: "Cartão de débito" },
  { value: "other", label: "Outro" },
] as const;

const PAYMENT_LABELS = new Map<string, string>(PAYMENT_METHODS.map((item) => [item.value, item.label]));

export function paymentMethodLabel(method: string | null): string {
  if (!method) return "Não informado";
  return PAYMENT_LABELS.get(method) ?? method;
}
