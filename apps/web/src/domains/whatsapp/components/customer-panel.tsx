import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/data/status-badge";
import type { CustomerDetail } from "@/domains/customers/queries";
import type { OpportunityCard } from "@/domains/crm/queries";
import type { ReservationListItem } from "@/domains/reservations/queries";
import type { SaleListItem } from "@/domains/sales/queries";
import { formatDate, formatMoney } from "@/lib/format";

export function CustomerPanel({
  customer,
  opportunities,
  reservations,
  sales,
}: {
  customer: CustomerDetail;
  opportunities: OpportunityCard[];
  reservations: ReservationListItem[];
  sales: SaleListItem[];
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-4">
      <div>
        <p className="text-body font-semibold">{customer.name}</p>
        <p className="text-small text-muted-foreground">{customer.phone ?? customer.whatsapp ?? "Sem telefone"}</p>
        {customer.email && <p className="text-small text-muted-foreground">{customer.email}</p>}
        <div className="mt-2 flex flex-wrap gap-1">
          {customer.tags.map((tag) => (
            <StatusBadge key={tag} tone="neutral" dot={false}>
              {tag}
            </StatusBadge>
          ))}
        </div>
        <Button asChild size="sm" variant="outline" className="mt-3">
          <Link href={`/app/clientes/${customer.id}`}>Ver ficha completa</Link>
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-small">
        <div>
          <dt className="text-caption text-subtle">Total comprado</dt>
          <dd className="font-medium">{formatMoney(customer.totalSpent)}</dd>
        </div>
        <div>
          <dt className="text-caption text-subtle">Compras</dt>
          <dd className="font-medium">{customer.purchaseCount}</dd>
        </div>
        <div>
          <dt className="text-caption text-subtle">Ticket médio</dt>
          <dd className="font-medium">{customer.averageTicket ? formatMoney(customer.averageTicket) : "—"}</dd>
        </div>
        <div>
          <dt className="text-caption text-subtle">Última compra</dt>
          <dd className="font-medium">{customer.lastPurchaseAt ? formatDate(customer.lastPurchaseAt) : "—"}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-2">
        <h3 className="text-caption font-semibold text-subtle uppercase">Oportunidades ({opportunities.length})</h3>
        {opportunities.length === 0 && <p className="text-small text-muted-foreground">Nenhuma oportunidade aberta.</p>}
        {opportunities.map((opportunity) => (
          <Link
            key={opportunity.id}
            href="/app/crm"
            className="rounded-md border border-border px-2.5 py-2 text-small hover:bg-secondary/60"
          >
            <p className="font-medium">{opportunity.title ?? "Sem título"}</p>
            {opportunity.estimatedValue !== null && (
              <p className="text-caption text-subtle">{formatMoney(opportunity.estimatedValue)}</p>
            )}
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-caption font-semibold text-subtle uppercase">Reservas ({reservations.length})</h3>
        {reservations.length === 0 && <p className="text-small text-muted-foreground">Nenhuma reserva.</p>}
        {reservations.map((reservation) => (
          <Link
            key={reservation.id}
            href={`/app/reservas/${reservation.id}`}
            className="flex items-center justify-between rounded-md border border-border px-2.5 py-2 text-small hover:bg-secondary/60"
          >
            <span>{formatDate(reservation.createdAt)}</span>
            <span className="font-medium">{formatMoney(reservation.total)}</span>
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-caption font-semibold text-subtle uppercase">Compras ({sales.length})</h3>
        {sales.length === 0 && <p className="text-small text-muted-foreground">Nenhuma venda.</p>}
        {sales.map((sale) => (
          <Link
            key={sale.id}
            href={`/app/vendas/${sale.id}`}
            className="flex items-center justify-between rounded-md border border-border px-2.5 py-2 text-small hover:bg-secondary/60"
          >
            <span>{formatDate(sale.createdAt)}</span>
            <span className="font-medium">{formatMoney(sale.total)}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
