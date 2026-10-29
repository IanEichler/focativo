import { CalendarCheck2, CalendarClock, CalendarX2, ClipboardList, UserX } from "lucide-react";
import Link from "next/link";
import { MetricCard } from "@/components/data/metric-card";
import { StatusBadge } from "@/components/data/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calendarDate, calendarTime, dateLabel } from "@/domains/agenda/calendar";
import { AppointmentQuickResolve } from "@/domains/agenda/components/appointment-quick-resolve";
import { appointmentHref } from "@/domains/agenda/components/unresolved-appointments";
import { customerHistory } from "@/domains/agenda/customer-history";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_TONES } from "@/domains/agenda/labels";
import { listAppointments, type AppointmentListItem } from "@/domains/agenda/queries";
import type { TenantContext } from "@/domains/tenants/context";
import { getTenantDetails } from "@/domains/tenants/queries";
import { createClient } from "@/lib/supabase/server";

const HISTORY_LIMIT = 500;

function AppointmentRow({
  appointment,
  timeZone,
  unmarked,
  canWrite,
}: {
  appointment: AppointmentListItem;
  timeZone: string;
  unmarked: boolean;
  canWrite: boolean;
}) {
  const day = calendarDate(appointment.startsAt, timeZone);
  const label = dateLabel(day, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body font-medium text-foreground">{appointment.serviceName || "Atendimento"}</span>
        <span className="text-small text-muted-foreground">
          <Link href={appointmentHref(appointment.id, appointment.startsAt, timeZone)} className="hover:underline">
            {label} · {calendarTime(appointment.startsAt, timeZone)}
          </Link>{" "}
          · {appointment.professionalName}
          {appointment.origin === "contract_signature" ? " · sessão de contrato" : ""}
        </span>
        {appointment.status === "CANCELED" && appointment.canceledReason && (
          <span className="text-caption text-muted-foreground">Motivo: {appointment.canceledReason}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {unmarked && <StatusBadge tone="warning">Não marcado</StatusBadge>}
        {unmarked && canWrite && (
          <AppointmentQuickResolve appointmentId={appointment.id} customerName={appointment.customerName} />
        )}
        <StatusBadge tone={APPOINTMENT_STATUS_TONES[appointment.status]}>
          {APPOINTMENT_STATUS_LABELS[appointment.status]}
        </StatusBadge>
      </div>
    </li>
  );
}

/** Tudo que a cliente já teve na agenda: o que vem pela frente e o que já passou (feito, cancelado, falta). */
export async function HistoryTab({ context, customerId }: { context: TenantContext; customerId: string }) {
  if (!context.hasModule("agenda") || !context.can("agenda.read")) {
    return (
      <EmptyState className="border-0" title="Sem acesso" description="Você não tem permissão para ver a agenda." />
    );
  }

  const supabase = await createClient();
  const [{ rows, total }, tenant, pendingSessions] = await Promise.all([
    listAppointments(context, { customerId, page: 1, pageSize: HISTORY_LIMIT }),
    getTenantDetails(context),
    supabase
      .from("contract_session_appointments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", context.tenant.id)
      .eq("customer_id", customerId)
      .is("appointment_id", null),
  ]);
  const history = customerHistory(rows, new Date());
  const timeZone = tenant.timezone;
  const pending = pendingSessions.count ?? 0;
  const canWrite = context.can("agenda.write");

  if (rows.length === 0 && pending === 0) {
    return (
      <EmptyState
        className="border-0"
        icon={<ClipboardList />}
        title="Nenhum agendamento ainda"
        description="Os atendimentos desta cliente aparecem aqui: os próximos, os realizados, os cancelados e as faltas."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Realizados"
          value={history.counts.completed}
          icon={<CalendarCheck2 />}
          hint={`de ${history.counts.total} agendamentos`}
        />
        <MetricCard label="Próximos" value={history.counts.upcoming} icon={<CalendarClock />} hint="Ainda marcados" />
        <MetricCard label="Cancelados" value={history.counts.canceled} icon={<CalendarX2 />} />
        <MetricCard
          label="Faltas"
          value={history.counts.noShow}
          icon={<UserX />}
          hint="Não compareceu"
          className={history.counts.noShow > 0 ? "border-warning/40" : undefined}
        />
      </div>

      {history.counts.unmarked > 0 && (
        <Link
          href="/app/agenda#sem-desfecho"
          className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-body transition-colors hover:border-warning/60"
        >
          {history.counts.unmarked === 1
            ? "1 atendimento já passou e continua como agendado ou confirmado."
            : `${history.counts.unmarked} atendimentos já passaram e continuam como agendados ou confirmados.`}{" "}
          Marque abaixo (em “Já aconteceram”) ou{" "}
          <span className="font-medium underline underline-offset-4">resolva na Agenda</span>.
        </Link>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Próximos</CardTitle>
        </CardHeader>
        <CardContent>
          {pending > 0 && (
            <p className="mb-2 text-small text-warning">
              {pending === 1 ? "1 sessão de contrato está" : `${pending} sessões de contrato estão`} sem horário na
              agenda.{" "}
              <Link href="/app/agenda" className="font-medium underline">
                Resolver na Agenda
              </Link>
            </p>
          )}
          {history.upcoming.length === 0 ? (
            <p className="text-small text-muted-foreground">Nenhum atendimento marcado daqui para frente.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {history.upcoming.map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  timeZone={timeZone}
                  unmarked={false}
                  canWrite={canWrite}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Já aconteceram</CardTitle>
        </CardHeader>
        <CardContent>
          {history.past.length === 0 ? (
            <p className="text-small text-muted-foreground">Nada por aqui ainda.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {history.past.map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  timeZone={timeZone}
                  unmarked={appointment.status === "SCHEDULED" || appointment.status === "CONFIRMED"}
                  canWrite={canWrite}
                />
              ))}
            </ul>
          )}
          {total > rows.length && (
            <p className="mt-2 text-small text-muted-foreground">
              Mostrando os {rows.length} primeiros de {total} agendamentos.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
