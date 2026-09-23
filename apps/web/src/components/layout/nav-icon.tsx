import {
  Activity,
  BarChart3,
  Bot,
  Boxes,
  Building2,
  CalendarClock,
  CalendarDays,
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
  Settings2,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { NavIconName } from "./nav-types";

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 22h-.005a9.87 9.87 0 01-5.031-1.379l-.361-.214-3.741.982.998-3.648-.235-.374A9.86 9.86 0 012 12.049C1.998 6.505 6.505 2 12.05 2c2.634.002 5.104 1.032 6.964 2.895a9.786 9.786 0 012.888 6.955c-.003 5.544-4.51 10.05-9.852 10.05zm8.413-18.464A11.815 11.815 0 0012.05 0C5.495 0 .002 5.5.002 12.049c0 2.125.554 4.199 1.607 6.032L0 24l6.052-1.588a11.996 11.996 0 005.997 1.596h.005c6.554 0 11.947-5.5 11.947-12.049a11.86 11.86 0 00-3.538-8.423z" />
    </svg>
  );
}

const ICONS: Record<NavIconName, LucideIcon | typeof WhatsAppGlyph> = {
  dashboard: LayoutDashboard,
  inbox: Inbox,
  kanban: KanbanSquare,
  "users-round": UsersRound,
  package: Package,
  boxes: Boxes,
  "calendar-clock": CalendarClock,
  "calendar-days": CalendarDays,
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
  whatsapp: WhatsAppGlyph,
  sliders: Settings2,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden="true" />;
}
