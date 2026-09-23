import type { ModuleCode } from "@/lib/modules";
import type { Permission } from "@/lib/permissions";

export type NavIconName =
  | "dashboard"
  | "inbox"
  | "kanban"
  | "users-round"
  | "package"
  | "boxes"
  | "calendar-clock"
  | "calendar-days"
  | "receipt"
  | "wallet"
  | "chart"
  | "message"
  | "users"
  | "settings"
  | "building"
  | "credit-card"
  | "layers"
  | "activity"
  | "bot"
  | "heart-pulse"
  | "flag"
  | "scroll"
  | "whatsapp"
  | "sliders";

export interface NavItem {
  title: string;
  href: string;
  icon: NavIconName;
  /** Permissão exigida para exibir o item (a página revalida no servidor). */
  permission?: Permission;
  /** Recurso opcional de plano que o admin master pode desligar por tenant (a página revalida no servidor). */
  module?: ModuleCode;
  /** Módulos ainda não implementados aparecem desabilitados — nunca como link morto. */
  availability?: "available" | "soon";
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}
