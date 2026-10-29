import type { Enums } from "@/types/database.types";

type Status = Enums<"appointment_status">;
type HistoryRow = { startsAt: string; status: Status };

export interface CustomerHistory<Row extends HistoryRow> {
  /** Ainda marcados (agendado ou confirmado) e no futuro — do mais próximo ao mais distante. */
  upcoming: Row[];
  /** Todo o resto — do mais recente ao mais antigo. */
  past: Row[];
  counts: {
    total: number;
    completed: number;
    upcoming: number;
    canceled: number;
    noShow: number;
    /** Já passaram, mas continuam como agendado/confirmado: ninguém marcou o que aconteceu. */
    unmarked: number;
  };
}

const OPEN: ReadonlySet<Status> = new Set<Status>(["SCHEDULED", "CONFIRMED"]);

export function customerHistory<Row extends HistoryRow>(rows: Row[], now: Date): CustomerHistory<Row> {
  const nowMs = now.getTime();
  const time = (row: Row) => new Date(row.startsAt).getTime();
  const upcoming = rows.filter((row) => OPEN.has(row.status) && time(row) >= nowMs).sort((a, b) => time(a) - time(b));
  const upcomingSet = new Set(upcoming);
  const past = rows.filter((row) => !upcomingSet.has(row)).sort((a, b) => time(b) - time(a));
  return {
    upcoming,
    past,
    counts: {
      total: rows.length,
      completed: rows.filter((row) => row.status === "COMPLETED").length,
      upcoming: upcoming.length,
      canceled: rows.filter((row) => row.status === "CANCELED").length,
      noShow: rows.filter((row) => row.status === "NO_SHOW").length,
      unmarked: past.filter((row) => OPEN.has(row.status)).length,
    },
  };
}
