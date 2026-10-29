import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/data/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TenantContext } from "@/domains/tenants/context";
import { calendarDate, calendarTime, dateLabel } from "../calendar";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_TONES } from "../labels";
import { listUnresolvedAppointments } from "../queries";
import { AppointmentQuickResolve } from "./appointment-quick-resolve";

/** Link para o atendimento no quadro do dia: abre a data e rola/destaca o cartão (#agendamento-…). */
export function appointmentHref(appointmentId: string, startsAt: string, timeZone: string): string {
  return `/app/agenda?data=${calendarDate(startsAt, timeZone)}#agendamento-${appointmentId}`;
}

/**
 * Topo da Agenda: atendimentos que já terminaram e continuam como agendado ou
 * confirmado. Cada um pode ser resolvido ali mesmo ou aberto no dia.
 */
export async function UnresolvedAppointments({
  context,
  timeZone,
  canWrite,
}: {
  context: TenantContext;
  timeZone: string;
  canWrite: boolean;
}) {
  const { rows, total } = await listUnresolvedAppointments(context);
  if (total === 0) return null;

  return (
    <Card id="sem-desfecho" className="scroll-mt-20 border-warning/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4 text-warning" />
          {total === 1 ? "1 atendimento sem desfecho" : `${total} atendimentos sem desfecho`}
        </CardTitle>
        <p className="text-small text-muted-foreground">
          Já passaram e continuam como agendados ou confirmados. Marque o que aconteceu: concluído, falta ou cancelado.
          Concluído gera a cobrança do atendimento no Financeiro (exceto sessões de contrato).
        </p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((appointment) => {
            const day = calendarDate(appointment.startsAt, timeZone);
            return (
              <li key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body font-medium text-foreground">
                    {appointment.customerName || "Cliente"} · {appointment.serviceName}
                  </span>
                  <span className="text-small text-muted-foreground">
                    <Link
                      href={appointmentHref(appointment.id, appointment.startsAt, timeZone)}
                      className="underline-offset-4 hover:underline"
                    >
                      {dateLabel(day, { weekday: "short", day: "2-digit", month: "short" })} ·{" "}
                      {calendarTime(appointment.startsAt, timeZone)}
                    </Link>{" "}
                    · {appointment.professionalName}
                    {appointment.origin === "contract_signature" ? " · sessão de contrato" : ""}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={APPOINTMENT_STATUS_TONES[appointment.status]}>
                    {APPOINTMENT_STATUS_LABELS[appointment.status]}
                  </StatusBadge>
                  {canWrite && (
                    <AppointmentQuickResolve appointmentId={appointment.id} customerName={appointment.customerName} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {total > rows.length && (
          <p className="mt-2 text-small text-muted-foreground">
            Mostrando os {rows.length} mais antigos de {total}. Resolva estes para ver os próximos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
