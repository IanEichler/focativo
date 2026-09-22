import { CalendarDays, CalendarPlus, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/data/data-table";
import { FilterBar, FilterSelect } from "@/components/data/filter-controls";
import { StatusBadge } from "@/components/data/status-badge";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { AppointmentFormSheet } from "@/domains/agenda/components/appointment-form";
import { AppointmentRowActions } from "@/domains/agenda/components/appointment-row-actions";
import {
  APPOINTMENT_STATUS_FILTERS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_TONES,
  isAppointmentStatus,
} from "@/domains/agenda/labels";
import {
  APPOINTMENT_PAGE_SIZE,
  listAppointments,
  listServices,
  type AppointmentListItem,
} from "@/domains/agenda/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { listTenantMembers } from "@/domains/users/queries";
import { formatDateTime } from "@/lib/format";
import { buildHref, firstParam, parsePage } from "@/lib/url";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage({ searchParams }: PageProps<"/app/agenda">) {
  const context = await requireTenantContext();
  if (!context.can("agenda.read") || !context.hasModule("agenda")) {
    return (
      <PageContainer>
        <PageHeader title="Agenda" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const params = await searchParams;
  const statusParam = firstParam(params.status);
  const status = statusParam && isAppointmentStatus(statusParam) ? statusParam : undefined;
  const page = parsePage(params.page);
  const canWrite = context.can("agenda.write");

  const [list, services, members] = await Promise.all([
    listAppointments(context, { status, page }),
    canWrite ? listServices(context, { activeOnly: true }) : Promise.resolve([]),
    canWrite ? listTenantMembers(context) : Promise.resolve([]),
  ]);
  const professionals = members
    .filter((m) => m.status === "ACTIVE")
    .map((m) => ({ userId: m.userId, fullName: m.fullName }));

  const columns: DataTableColumn<AppointmentListItem>[] = [
    {
      id: "when",
      header: "Quando",
      cell: (appointment) => <span className="font-medium tabular">{formatDateTime(appointment.startsAt)}</span>,
    },
    {
      id: "customer",
      header: "Cliente",
      cell: (appointment) => (
        <div className="flex flex-col">
          <span className="font-medium">{appointment.customerName}</span>
          <span className="text-small text-muted-foreground">{appointment.serviceName}</span>
        </div>
      ),
    },
    {
      id: "professional",
      header: "Profissional",
      hideBelow: "md",
      cell: (appointment) => <span className="text-muted-foreground">{appointment.professionalName}</span>,
    },
    {
      id: "status",
      header: "Situação",
      cell: (appointment) => (
        <StatusBadge tone={APPOINTMENT_STATUS_TONES[appointment.status]}>
          {APPOINTMENT_STATUS_LABELS[appointment.status]}
        </StatusBadge>
      ),
    },
    ...(canWrite
      ? [
          {
            id: "actions",
            header: "",
            align: "right" as const,
            cell: (appointment: AppointmentListItem) => <AppointmentRowActions appointment={appointment} />,
          },
        ]
      : []),
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Agenda"
        description="Serviços e agendamentos."
        actions={
          <div className="flex items-center gap-2">
            {canWrite && (
              <Button variant="outline" asChild>
                <Link href="/app/agenda/servicos">
                  <Settings2 /> Serviços
                </Link>
              </Button>
            )}
            {canWrite && (
              <AppointmentFormSheet
                services={services}
                professionals={professionals}
                trigger={
                  <Button>
                    <CalendarPlus /> Novo agendamento
                  </Button>
                }
              />
            )}
          </div>
        }
      />

      <DataTable
        caption="Agendamentos"
        columns={columns}
        rows={list.rows}
        getRowKey={(appointment) => appointment.id}
        toolbar={
          <FilterBar>
            <FilterSelect
              param="status"
              label="Situação"
              allLabel="Todas"
              options={APPOINTMENT_STATUS_FILTERS.map((value) => ({ value, label: APPOINTMENT_STATUS_LABELS[value] }))}
            />
          </FilterBar>
        }
        empty={
          <EmptyState
            className="border-0"
            icon={<CalendarDays />}
            title="Nenhum agendamento"
            description={
              services.length === 0 && canWrite
                ? "Cadastre um serviço antes de criar o primeiro agendamento."
                : "Crie um agendamento para começar."
            }
            action={
              canWrite ? (
                services.length === 0 ? (
                  <Button variant="outline" asChild>
                    <Link href="/app/agenda/servicos">
                      <Settings2 /> Cadastrar serviço
                    </Link>
                  </Button>
                ) : (
                  <AppointmentFormSheet
                    services={services}
                    professionals={professionals}
                    trigger={
                      <Button>
                        <CalendarPlus /> Novo agendamento
                      </Button>
                    }
                  />
                )
              ) : undefined
            }
          />
        }
        pagination={{
          page,
          pageSize: APPOINTMENT_PAGE_SIZE,
          total: list.total,
          hrefFor: (target) => buildHref("/app/agenda", params, { page: target > 1 ? target : undefined }),
        }}
      />
    </PageContainer>
  );
}
