import {
  Activity,
  BarChart3,
  Bot,
  Boxes,
  Building2,
  CalendarClock,
  CreditCard,
  Flag,
  HeartPulse,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Layers,
  MessageCircle,
  Package,
  Receipt,
  ScrollText,
  Settings,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { NavIconName } from "./nav-types";

const ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  inbox: Inbox,
  kanban: KanbanSquare,
  "users-round": UsersRound,
  package: Package,
  boxes: Boxes,
  "calendar-clock": CalendarClock,
  receipt: Receipt,
  wallet: Wallet,
  chart: BarChart3,
  message: MessageCircle,
  users: Users,
  settings: Settings,
  building: Building2,
  "credit-card": CreditCard,
  layers: Layers,
  activity: Activity,
  bot: Bot,
  "heart-pulse": HeartPulse,
  flag: Flag,
  scroll: ScrollText,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden="true" />;
}
