import type { StatusTone } from "@/components/data/status-badge";
import type { Enums } from "@/types/database.types";

type AppointmentStatus = Enums<"appointment_status">;

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  COMPLETED: "Concluído",
  CANCELED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

export const APPOINTMENT_STATUS_TONES: Record<AppointmentStatus, StatusTone> = {
  SCHEDULED: "neutral",
  CONFIRMED: "info",
  COMPLETED: "success",
  CANCELED: "danger",
  NO_SHOW: "warning",
};

export const APPOINTMENT_STATUS_FILTERS = ["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELED", "NO_SHOW"] as const;

export function isAppointmentStatus(value: string): value is AppointmentStatus {
  return value in APPOINTMENT_STATUS_LABELS;
}
