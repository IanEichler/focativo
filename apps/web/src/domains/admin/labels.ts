import type { StatusTone } from "@/components/data/status-badge";
import type { Enums } from "@/types/database.types";

export const TENANT_STATUS_LABEL: Record<Enums<"tenant_status">, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: "Ativa", tone: "success" },
  SUSPENDED: { label: "Suspensa", tone: "warning" },
  CANCELED: { label: "Cancelada", tone: "neutral" },
};

export const PLATFORM_ACTION_LABEL: Record<string, string> = {
  "tenant.status_changed": "Status alterado",
};
