import { CalendarClock, CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/data/data-table";
import { FilterBar, FilterSelect } from "@/components/data/filter-controls";
import { MoneyValue } from "@/components/data/money-value";
import { StatusBadge } from "@/components/data/status-badge";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { ReservationFormSheet } from "@/domains/reservations/components/reservation-form";
import {
  RESERVATION_STATUS_FILTERS,
  RESERVATION_STATUS_LABELS,
  RESERVATION_STATUS_TONES,
  isReservationStatus,
} from "@/domains/reservations/labels";
import { listReservations, RESERVATION_PAGE_SIZE, type ReservationListItem } from "@/domains/reservations/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { buildHref, firstParam, parsePage } from "@/lib/url";

export const metadata: Metadata = { title: "Reservas" };

export default async function ReservationsPage({ searchParams }: PageProps<"/app/reservas">) {
  const context = await requireTenantContext();
  if (!context.can("reservations.read") || !context.hasModule("reservations")) {
    return (
      <PageContainer>
        <PageHeader title="Reservas" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const params = await searchParams;
  const statusParam = firstParam(params.status);
  const status = statusParam && isReservationStatus(statusParam) ? statusParam : undefined;
  const page = parsePage(params.page);

  // Varredura oportunista: o job em segundo plano (services/jobs, Fase 8) já varre
  // todos os tenants periodicamente via reservations_expire_due_sweep, mas expirar
  // também aqui garante que a lista nunca mostre uma reserva vencida "atrasada".
  const supabase = await createClient();
  await supabase.rpc("reservations_expire_due", { p_tenant_id: context.tenant.id });

  const list = await listReservations(context, { status, page });
  const canWrite = context.can("reservations.write");

  const columns: DataTableColumn<ReservationListItem>[] = [
    {
      id: "reservation",
      header: "Reserva",
      cell: (reservation) => (
        <Link
          href={`/app/reservas/${reservation.id}`}
          className="flex flex-col rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="font-medium hover:underline">{reservation.customerName}</span>
          <span className="text-small text-muted-foreground">{formatDateTime(reservation.createdAt)}</span>
        </Link>
      ),
    },
    {
      id: "status",
      header: "Situação",
      cell: (reservation) => (
        <StatusBadge tone={RESERVATION_STATUS_TONES[reservation.status]}>
          {RESERVATION_STATUS_LABELS[reservation.status]}
        </StatusBadge>
      ),
    },
    {
      id: "expires",
      header: "Expira",
      hideBelow: "md",
      cell: (reservation) => (
        <span className="text-muted-foreground">
          {reservation.expiresAt ? formatDateTime(reservation.expiresAt) : "—"}
        </span>
      ),
    },
    { id: "total", header: "Valor", align: "right", cell: (reservation) => <MoneyValue value={reservation.total} /> },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Reservas"
        description="Segure produtos para um cliente sem baixar o estoque físico."
        actions={
          canWrite ? (
            <ReservationFormSheet
              trigger={
                <Button>
                  <CalendarPlus /> Nova reserva
                </Button>
              }
            />
          ) : undefined
        }
      />

      <DataTable
        caption="Reservas"
        columns={columns}
        rows={list.rows}
        getRowKey={(reservation) => reservation.id}
        toolbar={
          <FilterBar>
            <FilterSelect
              param="status"
              label="Situação"
              allLabel="Todas"
              options={RESERVATION_STATUS_FILTERS.map((value) => ({ value, label: RESERVATION_STATUS_LABELS[value] }))}
            />
          </FilterBar>
        }
        empty={
          <EmptyState
            className="border-0"
            icon={<CalendarClock />}
            title="Nenhuma reserva"
            description="Crie uma reserva para segurar produtos para um cliente."
            action={
              canWrite ? (
                <ReservationFormSheet
                  trigger={
                    <Button>
                      <CalendarPlus /> Nova reserva
                    </Button>
                  }
                />
              ) : undefined
            }
          />
        }
        pagination={{
          page,
          pageSize: RESERVATION_PAGE_SIZE,
          total: list.total,
          hrefFor: (target) => buildHref("/app/reservas", params, { page: target > 1 ? target : undefined }),
        }}
      />
    </PageContainer>
  );
}
