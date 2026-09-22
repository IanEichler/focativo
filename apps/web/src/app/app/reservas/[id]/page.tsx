import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MoneyValue } from "@/components/data/money-value";
import { StatusBadge } from "@/components/data/status-badge";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { originLabel } from "@/domains/customers/labels";
import { PaymentsSection } from "@/domains/payments/components/payments-section";
import { listReservationPayments } from "@/domains/payments/queries";
import { RESERVATION_STATUS_LABELS, RESERVATION_STATUS_TONES } from "@/domains/reservations/labels";
import { getReservationDetail } from "@/domains/reservations/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { formatDateTime } from "@/lib/format";
import { ReservationActions } from "./reservation-actions";

export const metadata: Metadata = { title: "Reserva" };

export default async function ReservationDetailPage({ params }: PageProps<"/app/reservas/[id]">) {
  const context = await requireTenantContext();
  const { id } = await params;
  if (!context.can("reservations.read") || !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const reservation = await getReservationDetail(context, id);
  if (!reservation) notFound();

  const canWrite = context.can("reservations.write");
  const canSeePayments = context.can("sales.read");
  const payments = canSeePayments ? await listReservationPayments(context, reservation.id) : [];
  const reservationActive = !["COMPLETED", "CANCELED", "EXPIRED"].includes(reservation.status);

  return (
    <PageContainer>
      <div>
        <Link
          href="/app/reservas"
          className="inline-flex items-center gap-1.5 text-small text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-4" /> Reservas
        </Link>
      </div>

      <PageHeader
        title={reservation.customerName}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{formatDateTime(reservation.createdAt)}</span>
            {reservation.origin && <span>· {originLabel(reservation.origin)}</span>}
            <StatusBadge tone={RESERVATION_STATUS_TONES[reservation.status]}>
              {RESERVATION_STATUS_LABELS[reservation.status]}
            </StatusBadge>
          </span>
        }
        actions={
          canWrite ? (
            <ReservationActions
              reservationId={reservation.id}
              customerId={reservation.customerId}
              status={reservation.status}
            />
          ) : undefined
        }
      />

      {reservation.status === "CANCELED" && reservation.canceledReason && (
        <Card className="border-danger/40">
          <CardContent className="py-4 text-body text-danger">Motivo: {reservation.canceledReason}</CardContent>
        </Card>
      )}
      {reservation.expiresAt && (
        <p className="text-small text-muted-foreground">Expira em {formatDateTime(reservation.expiresAt)}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Itens reservados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservation.items.map((item) => (
                <TableRow key={item.variantId}>
                  <TableCell>
                    {item.variantName !== item.productName
                      ? `${item.productName} — ${item.variantName}`
                      : item.productName}
                  </TableCell>
                  <TableCell className="text-right tabular">{item.quantity}</TableCell>
                  <TableCell className="text-right">
                    <MoneyValue value={item.unitPrice} />
                  </TableCell>
                  <TableCell className="text-right">
                    <MoneyValue value={item.quantity * item.unitPrice} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex justify-end gap-4 text-body font-semibold">
            <span>Total</span>
            <span className="w-24 text-right tabular">
              <MoneyValue value={reservation.total} />
            </span>
          </div>
        </CardContent>
      </Card>

      {canSeePayments && (
        <Card>
          <CardHeader>
            <CardTitle>Pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentsSection
              reservationId={reservation.id}
              payments={payments}
              canWrite={context.can("sales.write")}
              reservationActive={reservationActive}
            />
          </CardContent>
        </Card>
      )}

      {reservation.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent className="text-body text-muted-foreground">{reservation.notes}</CardContent>
        </Card>
      )}

      {reservation.completedSaleId && (
        <Link href={`/app/vendas/${reservation.completedSaleId}`} className="text-body text-brand-600 hover:underline">
          Ver venda gerada
        </Link>
      )}
    </PageContainer>
  );
}
