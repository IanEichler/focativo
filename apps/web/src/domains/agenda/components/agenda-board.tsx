import Link from "next/link";
import { CalendarDays, Clock3, FileCheck2, UserRound } from "lucide-react";
import { StatusBadge } from "@/components/data/status-badge";
import { cn } from "@/lib/utils";
import { calendarDate, calendarTime, dateLabel } from "../calendar";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_TONES } from "../labels";
import type { AppointmentListItem } from "../queries";
import { AppointmentRowActions } from "./appointment-row-actions";

const accents = {
  SCHEDULED: "border-l-violet-400",
  CONFIRMED: "border-l-info",
  COMPLETED: "border-l-success",
  CANCELED: "border-l-danger",
  NO_SHOW: "border-l-warning",
};

export function AgendaBoard({
  rows,
  days,
  timeZone,
  today,
  canWrite,
  canReadCustomer,
  partial = false,
}: {
  rows: AppointmentListItem[];
  days: string[];
  timeZone: string;
  today: string;
  canWrite: boolean;
  canReadCustomer: boolean;
  partial?: boolean;
}) {
  const week = days.length > 1;
  return (
    <div className={cn(week ? "grid gap-3 md:grid-cols-2 xl:grid-cols-4" : "flex flex-col gap-4")}>
      {days.map((day) => {
        const appointments = rows.filter((row) => calendarDate(row.startsAt, timeZone) === day);
        return (
          <section
            key={day}
            aria-label={dateLabel(day, { weekday: "long", day: "numeric", month: "long" })}
            className={cn("min-w-0 rounded-2xl border bg-card", today === day ? "border-info/30" : "border-border")}
          >
            <header
              className={cn(
                "flex items-center justify-between gap-2 rounded-t-2xl border-b border-border px-4 py-3",
                today === day && "bg-info-soft/50",
              )}
            >
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-muted-foreground" />
                <h2 className="font-medium capitalize">
                  {dateLabel(day, { weekday: week ? "short" : "long", day: "2-digit", month: "2-digit" })}
                </h2>
                {today === day && (
                  <span className="rounded-full bg-info-soft px-2 py-0.5 text-caption font-medium text-info">Hoje</span>
                )}
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-caption tabular-nums">{appointments.length}</span>
            </header>
            <div className={cn("flex flex-col gap-3 p-3", week && "max-h-[28rem] overflow-y-auto")}>
              {!appointments.length && (
                <p className="py-8 text-center text-small text-muted-foreground">
                  {partial ? "Nenhum atendimento nesta página." : "Sem agendamentos com estes filtros."}
                </p>
              )}
              {appointments.map((appointment) => (
                <article
                  key={appointment.id}
                  className={cn(
                    "rounded-xl border border-l-4 border-border bg-background p-4",
                    accents[appointment.status],
                    appointment.status === "CANCELED" && "opacity-65",
                  )}
                >
                  <div className={cn("flex gap-4", week ? "flex-col" : "flex-col sm:flex-row")}>
                    <div className={cn("shrink-0", !week && "sm:w-28")}>
                      <p className="text-lg font-semibold tracking-tight tabular-nums">
                        {calendarTime(appointment.startsAt, timeZone)}{" "}
                        <span className="text-small font-normal text-muted-foreground">
                          – {calendarTime(appointment.endsAt, timeZone)}
                        </span>
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-caption text-muted-foreground">
                        <Clock3 className="size-3" />
                        {Math.round((Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60000)} min
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold break-words">
                            {canReadCustomer ? (
                              <Link
                                className="underline-offset-4 hover:underline"
                                href={`/app/clientes/${appointment.customerId}`}
                              >
                                {appointment.customerName || "Cliente"}
                              </Link>
                            ) : (
                              appointment.customerName || "Cliente"
                            )}
                          </h3>
                          <p className="mt-0.5 text-small break-words text-muted-foreground">
                            {appointment.serviceName}
                          </p>
                        </div>
                        {canWrite && <AppointmentRowActions appointment={appointment} />}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatusBadge tone={APPOINTMENT_STATUS_TONES[appointment.status]}>
                          {APPOINTMENT_STATUS_LABELS[appointment.status]}
                        </StatusBadge>
                        <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                          <UserRound className="size-3.5" />
                          {appointment.professionalName}
                        </span>
                        {appointment.origin === "contract_signature" &&
                          (canReadCustomer ? (
                            <Link
                              href={`/app/clientes/${appointment.customerId}?aba=contratos`}
                              className="inline-flex items-center gap-1 rounded-md bg-success-soft px-2 py-1 text-caption text-success"
                            >
                              <FileCheck2 className="size-3.5" />
                              Contrato assinado
                            </Link>
                          ) : (
                            <StatusBadge tone="success">Contrato assinado</StatusBadge>
                          ))}
                      </div>
                      {(appointment.notes || appointment.canceledReason) && (
                        <details className="mt-3 text-small text-muted-foreground">
                          <summary className="w-fit cursor-pointer text-caption hover:text-foreground">
                            {appointment.canceledReason ? "Motivo do cancelamento" : "Observações"}
                          </summary>
                          <p className="mt-2 break-words whitespace-pre-wrap">
                            {appointment.canceledReason || appointment.notes}
                          </p>
                        </details>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
