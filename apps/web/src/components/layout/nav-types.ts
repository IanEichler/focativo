import type { Permission } from "@/lib/permissions";

export type NavIconName =
  | "dashboard"
  | "inbox"
  | "kanban"
  | "users-round"
  | "package"
  | "boxes"
  | "calendar-clock"
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
  | "scroll";

export interface NavItem {
  title: string;
  href: string;
  icon: NavIconName;
  /** Permissão exigida para exibir o item (a página revalida no servidor). */
  permission?: Permission;
  /** Módulos ainda não implementados aparecem desabilitados — nunca como link morto. */
  availability?: "available" | "soon";
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}
