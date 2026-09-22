import type { StatusTone } from "@/components/data/status-badge";
import type { Enums } from "@/types/database.types";

type PaymentStatus = Enums<"payment_status">;

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Aguardando pagamento",
  CONFIRMED: "Confirmado",
  FAILED: "Falhou",
  CANCELED: "Cancelado",
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, StatusTone> = {
  PENDING: "warning",
  CONFIRMED: "success",
  FAILED: "danger",
  CANCELED: "neutral",
};
