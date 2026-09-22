import type { StatusTone } from "@/components/data/status-badge";
import type { Enums } from "@/types/database.types";

type ReservationStatus = Enums<"reservation_status">;

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmada",
  AWAITING_PICKUP: "Aguardando retirada",
  COMPLETED: "Concluída",
  EXPIRED: "Expirada",
  CANCELED: "Cancelada",
};

export const RESERVATION_STATUS_TONES: Record<ReservationStatus, StatusTone> = {
  PENDING: "neutral",
  CONFIRMED: "info",
  AWAITING_PICKUP: "warning",
  COMPLETED: "success",
  EXPIRED: "neutral",
  CANCELED: "danger",
};

export const RESERVATION_STATUS_FILTERS = [
  "PENDING",
  "CONFIRMED",
  "AWAITING_PICKUP",
  "COMPLETED",
  "EXPIRED",
  "CANCELED",
] as const;

export function isReservationStatus(value: string): value is ReservationStatus {
  return value in RESERVATION_STATUS_LABELS;
}
