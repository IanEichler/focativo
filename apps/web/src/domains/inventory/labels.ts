import type { StatusTone } from "@/components/data/status-badge";
import type { Enums } from "@/types/database.types";

export const MOVEMENT_TYPE: Record<Enums<"stock_movement_type">, { label: string; tone: StatusTone }> = {
  ENTRY: { label: "Entrada", tone: "success" },
  RETURN: { label: "Devolução", tone: "success" },
  SALE: { label: "Venda", tone: "brand" },
  RESERVATION: { label: "Reserva", tone: "info" },
  RESERVATION_RELEASE: { label: "Liberação de reserva", tone: "neutral" },
  ADJUSTMENT: { label: "Ajuste", tone: "warning" },
  LOSS: { label: "Perda", tone: "danger" },
};

export const MOVEMENT_ORIGIN: Record<Enums<"stock_movement_origin">, string> = {
  MANUAL: "Manual",
  RESERVATION: "Reserva",
  ORDER: "Pedido",
  SALE: "Venda",
  IMPORT: "Importação",
  SYSTEM: "Sistema",
};

export type ExpiryStatus = "OK" | "EXPIRING" | "EXPIRED" | "NO_EXPIRY";

export const EXPIRY_STATUS: Record<ExpiryStatus, { label: string; tone: StatusTone }> = {
  OK: { label: "Dentro da validade", tone: "success" },
  EXPIRING: { label: "Vencendo", tone: "warning" },
  EXPIRED: { label: "Vencido", tone: "danger" },
  NO_EXPIRY: { label: "Sem validade", tone: "neutral" },
};

export function isExpiryStatus(value: unknown): value is ExpiryStatus {
  return value === "OK" || value === "EXPIRING" || value === "EXPIRED" || value === "NO_EXPIRY";
}
