/** Calendar arithmetic uses dates, while appointment instants use the clinic's IANA timezone. */
export function validCalendarDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function calendarDate(value: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function calendarTime(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(value),
  );
}
export function dateLabel(
  value: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
): string {
  return new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
export function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function weekStart(value: string): string {
  const weekday = new Date(`${value}T12:00:00Z`).getUTCDay();
  return shiftDate(value, -((weekday + 6) % 7));
}
export function clinicDateTime(value: string, timeZone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value) || !validCalendarDate(value.slice(0, 10)))
    throw new Error("Data e horário inválidos.");
  const desired = Date.parse(`${value}:00Z`);
  let instant = desired;
  for (let attempt = 0; attempt < 4; attempt++) {
    const local = `${calendarDate(new Date(instant), timeZone)}T${calendarTime(new Date(instant), timeZone)}`;
    const correction = desired - Date.parse(`${local}:00Z`);
    if (!correction) return new Date(instant);
    instant += correction;
  }
  throw new Error("Esse horário não existe no fuso da clínica. Escolha outro horário.");
}
export function agendaPeriod(date: string, view: "day" | "week", timeZone: string) {
  const first = view === "week" ? weekStart(date) : date;
  const days = Array.from({ length: view === "week" ? 7 : 1 }, (_, index) => shiftDate(first, index));
  return {
    days,
    from: clinicDateTime(`${first}T00:00`, timeZone).toISOString(),
    to: clinicDateTime(`${shiftDate(first, days.length)}T00:00`, timeZone).toISOString(),
  };
}
