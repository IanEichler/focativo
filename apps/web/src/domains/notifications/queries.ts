import "server-only";
import { getTodayAgendaSummary } from "@/domains/agenda/queries";
import { getInventorySummary } from "@/domains/inventory/queries";
import { listPendingCharges } from "@/domains/payments/queries";
import { getReservationsExpiringSoonCount } from "@/domains/reservations/queries";
import type { TenantContext } from "@/domains/tenants/context";
import { getUnreadConversationsCount } from "@/domains/whatsapp/queries";

export interface NotificationItem {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: "warning" | "danger" | "info";
}

/**
 * Composição ao vivo a partir dos próprios domínios (nenhuma tabela nova):
 * cada item só é buscado se o usuário tem a permissão E o módulo do item.
 * Mesmo espírito do dashboard — nunca uma segunda fonte de verdade.
 */
export async function getNotifications(context: TenantContext): Promise<NotificationItem[]> {
  const canInventory = context.can("inventory.read") && context.hasModule("inventory");
  const canReservations = context.can("reservations.read") && context.hasModule("reservations");
  const canFinancial = context.can("financial.read") && context.hasModule("financial");
  const canWhatsapp = context.can("whatsapp.read") && context.hasModule("whatsapp");
  const canAgenda = context.can("agenda.read") && context.hasModule("agenda");

  const [inventory, expiringSoon, pendingCharges, unreadConversations, agendaToday] = await Promise.all([
    canInventory ? getInventorySummary(context) : Promise.resolve(null),
    canReservations ? getReservationsExpiringSoonCount(context) : Promise.resolve(0),
    canFinancial ? listPendingCharges(context) : Promise.resolve([]),
    canWhatsapp ? getUnreadConversationsCount(context) : Promise.resolve(0),
    canAgenda ? getTodayAgendaSummary(context) : Promise.resolve(null),
  ]);

  const items: NotificationItem[] = [];

  if (inventory) {
    if (inventory.outOfStock > 0) {
      items.push({
        key: "out-of-stock",
        label: "Produtos sem estoque",
        count: inventory.outOfStock,
        href: "/app/estoque?status=OUT",
        tone: "danger",
      });
    }
    if (inventory.expiredLots > 0) {
      items.push({
        key: "expired-lots",
        label: "Lotes vencidos",
        count: inventory.expiredLots,
        href: "/app/estoque?aba=lotes&status=EXPIRED",
        tone: "danger",
      });
    }
    if (inventory.lowStock > 0) {
      items.push({
        key: "low-stock",
        label: "Estoque baixo",
        count: inventory.lowStock,
        href: "/app/estoque?status=LOW",
        tone: "warning",
      });
    }
    if (inventory.expiringLots > 0) {
      items.push({
        key: "expiring-lots",
        label: "Lotes vencendo em breve",
        count: inventory.expiringLots,
        href: "/app/estoque?aba=lotes&status=EXPIRING",
        tone: "warning",
      });
    }
  }

  if (expiringSoon > 0) {
    items.push({
      key: "reservations-expiring",
      label: "Reservas vencendo em 24h",
      count: expiringSoon,
      href: "/app/reservas",
      tone: "warning",
    });
  }

  if (pendingCharges.length > 0) {
    items.push({
      key: "pending-charges",
      label: "Cobranças aguardando pagamento",
      count: pendingCharges.length,
      href: "/app/financeiro",
      tone: "info",
    });
  }

  if (unreadConversations > 0) {
    items.push({
      key: "unread-whatsapp",
      label: "Conversas não lidas",
      count: unreadConversations,
      href: "/app/atendimento",
      tone: "info",
    });
  }

  if (agendaToday && agendaToday.count > 0) {
    items.push({
      key: "agenda-today",
      label: "Compromissos hoje",
      count: agendaToday.count,
      href: "/app/agenda",
      tone: "info",
    });
  }

  return items;
}
