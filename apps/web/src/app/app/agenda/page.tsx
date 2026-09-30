import { CalendarPlus, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Pagination } from "@/components/data/data-table";
import { AccessDenied } from "@/components/feedback/access-denied";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { agendaPeriod, calendarDate, validCalendarDate } from "@/domains/agenda/calendar";
import { AgendaBoard } from "@/domains/agenda/components/agenda-board";
import { AgendaToolbar } from "@/domains/agenda/components/agenda-toolbar";
import { AppointmentFormSheet } from "@/domains/agenda/components/appointment-form";
import { ContractSessionsPending } from "@/domains/agenda/components/contract-session-pending";
import { isAppointmentStatus } from "@/domains/agenda/labels";
import { listAppointments, listServices } from "@/domains/agenda/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { getTenantDetails } from "@/domains/tenants/queries";
import { listTenantMembers } from "@/domains/users/queries";
import { buildHref, firstParam, parsePage } from "@/lib/url";

export const metadata: Metadata = { title: "Agenda" };
const PAGE_SIZE = 100;

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
  const canWrite = context.can("agenda.write");
  const [tenant, services, members] = await Promise.all([
    getTenantDetails(context),
    canWrite ? listServices(context, { activeOnly: true }) : Promise.resolve([]),
    listTenantMembers(context),
  ]);
  const timeZone = tenant.timezone;
  const today = calendarDate(new Date(), timeZone);
  const requestedDate = firstParam(params.data);
  const date = validCalendarDate(requestedDate) ? requestedDate : today;
  const view = firstParam(params.visao) === "week" ? "week" : "day";
  const period = agendaPeriod(date, view, timeZone);
  const statusParam = firstParam(params.status);
  const status = statusParam && isAppointmentStatus(statusParam) ? statusParam : undefined;
  const professionalParam = firstParam(params.profissional);
  const professionalId = members.some((member) => member.userId === professionalParam) ? professionalParam : undefined;
  const page = parsePage(params.page);
  const list = await listAppointments(context, {
    status,
    professionalId,
    from: period.from,
    to: period.to,
    page,
    pageSize: PAGE_SIZE,
  });
  if (page > Math.max(1, Math.ceil(list.total / PAGE_SIZE))) {
    redirect(buildHref("/app/agenda", params, { page: undefined }));
  }
  const professionals = members
    .filter((member) => member.status === "ACTIVE")
    .map((member) => ({ userId: member.userId, fullName: member.fullName }));
  const partial = list.total > list.rows.length;
  const summary = [
    { label: "Agendados", count: list.rows.filter((row) => row.status === "SCHEDULED").length, color: "bg-violet-400" },
    { label: "Confirmados", count: list.rows.filter((row) => row.status === "CONFIRMED").length, color: "bg-info" },
    { label: "Concluídos", count: list.rows.filter((row) => row.status === "COMPLETED").length, color: "bg-success" },
  ];
  return (
    <PageContainer>
      <PageHeader
        title="Agenda"
        description="Organize os atendimentos e acompanhe cada sessão."
        actions={
          canWrite && (
            <AppointmentFormSheet
              services={services}
              professionals={professionals}
              initialDate={date}
              timeZone={timeZone}
              trigger={
                <Button>
                  <CalendarPlus /> Novo agendamento
                </Button>
              }
            />
          )
        }
      />
      <ContractSessionsPending
        context={context}
        services={services}
        professionals={professionals}
        timeZone={timeZone}
      />
      <AgendaToolbar
        date={date}
        days={period.days}
        today={today}
        view={view}
        params={params}
        professionals={members.map((member) => ({ userId: member.userId, fullName: member.fullName }))}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 text-small text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">{list.total}</span>{" "}
          {list.total === 1 ? "atendimento" : "atendimentos"} no período{partial && " · resumo desta página"}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {summary.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${item.color}`} />
              {item.count} {item.label.toLowerCase()}
            </span>
          ))}
        </div>
      </div>
      {canWrite && services.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-small">
          <p>Cadastre um serviço para criar novos agendamentos.</p>
          <Button variant="outline" asChild>
            <Link href="/app/agenda/servicos">
              <Settings2 /> Cadastrar serviço
            </Link>
          </Button>
        </div>
      )}
      <AgendaBoard
        rows={list.rows}
        days={period.days}
        timeZone={timeZone}
        today={today}
        canWrite={canWrite}
        canReadCustomer={context.can("customers.read")}
        partial={partial}
      />
      {list.total > 0 && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={list.total}
          hrefFor={(target) => buildHref("/app/agenda", params, { page: target > 1 ? target : undefined })}
        />
      )}
      <p className="text-caption text-muted-foreground">
        Horários no fuso da clínica: {timeZone}. As sessões com data e horário definidos no contrato entram na agenda
        após a assinatura.
      </p>
    </PageContainer>
  );
}
