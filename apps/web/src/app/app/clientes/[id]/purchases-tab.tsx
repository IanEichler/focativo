import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { MoneyValue } from "@/components/data/money-value";
import { StatusBadge } from "@/components/data/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RESERVATION_STATUS_LABELS, RESERVATION_STATUS_TONES } from "@/domains/reservations/labels";
import { listReservationsByCustomer } from "@/domains/reservations/queries";
import { saleOriginLabel } from "@/domains/sales/labels";
import { listSalesByCustomer } from "@/domains/sales/queries";
import type { TenantContext } from "@/domains/tenants/context";
import { formatDateTime } from "@/lib/format";

export async function PurchasesTab({ context, customerId }: { context: TenantContext; customerId: string }) {
  const canSeeSales = context.can("sales.read");
  const canSeeReservations = context.can("reservations.read");

  const [sales, reservations] = await Promise.all([
    canSeeSales ? listSalesByCustomer(context, customerId) : Promise.resolve([]),
    canSeeReservations ? listReservationsByCustomer(context, customerId) : Promise.resolve([]),
  ]);

  if (!canSeeSales && !canSeeReservations) {
    return (
      <EmptyState
        className="border-0"
        title="Sem acesso"
        description="Você não tem permissão para ver vendas ou reservas."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canSeeReservations && (
        <Card>
          <CardHeader>
            <CardTitle>Reservas</CardTitle>
          </CardHeader>
          <CardContent>
            {reservations.length === 0 ? (
              <p className="text-small text-muted-foreground">Nenhuma reserva.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {reservations.map((reservation) => (
                  <Link
                    key={reservation.id}
                    href={`/app/reservas/${reservation.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 hover:underline"
                  >
                    <span className="text-small text-muted-foreground">{formatDateTime(reservation.createdAt)}</span>
                    <StatusBadge tone={RESERVATION_STATUS_TONES[reservation.status]}>
                      {RESERVATION_STATUS_LABELS[reservation.status]}
                    </StatusBadge>
                    <MoneyValue value={reservation.total} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {canSeeSales && (
        <Card>
          <CardHeader>
            <CardTitle>Vendas</CardTitle>
          </CardHeader>
          <CardContent>
            {sales.length === 0 ? (
              <p className="text-small text-muted-foreground">Nenhuma venda.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {sales.map((sale) => (
                  <Link
                    key={sale.id}
                    href={`/app/vendas/${sale.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 hover:underline"
                  >
                    <span className="text-small text-muted-foreground">
                      {formatDateTime(sale.createdAt)} · {saleOriginLabel(sale.origin)}
                    </span>
                    {sale.canceledAt ? (
                      <StatusBadge tone="danger">Cancelada</StatusBadge>
                    ) : (
                      <StatusBadge tone="success">Concluída</StatusBadge>
                    )}
                    <MoneyValue value={sale.total} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
