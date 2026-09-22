import type { StatusTone } from "@/components/data/status-badge";
import type { Enums } from "@/types/database.types";

export const TENANT_STATUS_LABEL: Record<Enums<"tenant_status">, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: "Ativa", tone: "success" },
  SUSPENDED: { label: "Suspensa", tone: "warning" },
  CANCELED: { label: "Cancelada", tone: "neutral" },
};

export const PLATFORM_ACTION_LABEL: Record<string, string> = {
  "tenant.status_changed": "Status alterado",
  "tenant.created_by_admin": "Empresa criada pelo admin master",
  "tenant.module_flag_changed": "Módulo alterado",
  "user.password_reset_by_admin": "Senha redefinida pelo admin master",
  "tenant_user.created_by_admin": "Usuário criado pelo admin master",
  "tenant_user.removed_by_admin": "Usuário removido pelo admin master",
  "tenant_user.permissions_changed_by_admin": "Permissões personalizadas pelo admin master",
};
