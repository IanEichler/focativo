import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/data/filter-controls";
import { buildHref, type SearchParamsRecord } from "@/lib/url";
import { dateLabel, shiftDate } from "../calendar";
import { APPOINTMENT_STATUS_FILTERS, APPOINTMENT_STATUS_LABELS } from "../labels";
import type { ProfessionalOption } from "../queries";
import { AgendaDatePicker } from "./agenda-date-picker";

export function AgendaToolbar({
  date,
  days,
  today,
  view,
  params,
  professionals,
}: {
  date: string;
  days: string[];
  today: string;
  view: "day" | "week";
  params: SearchParamsRecord;
  professionals: ProfessionalOption[];
}) {
  const href = (patch: Record<string, string | undefined>) =>
    buildHref("/app/agenda", params, { data: date, visao: view, ...patch, page: undefined });
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" asChild>
              <Link
                href={href({ data: shiftDate(date, view === "week" ? -7 : -1) })}
                scroll={false}
                aria-label={view === "week" ? "Semana anterior" : "Dia anterior"}
              >
                <ChevronLeft />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={href({ data: today })} scroll={false}>
                Hoje
              </Link>
            </Button>
            <Button variant="outline" size="icon-sm" asChild>
              <Link
                href={href({ data: shiftDate(date, view === "week" ? 7 : 1) })}
                scroll={false}
                aria-label={view === "week" ? "Próxima semana" : "Próximo dia"}
              >
                <ChevronRight />
              </Link>
            </Button>
          </div>
          <h2 className="text-base font-semibold">
            {view === "day"
              ? dateLabel(date, { day: "numeric", month: "long", year: "numeric" })
              : `${dateLabel(days[0], { day: "2-digit", month: "short" })} – ${dateLabel(days[6], { day: "2-digit", month: "short", year: "numeric" })}`}
          </h2>
        </div>
        <nav aria-label="Visualização da agenda" className="flex rounded-lg bg-muted p-1">
          {(["day", "week"] as const).map((value) => (
            <Button key={value} variant={view === value ? "outline" : "ghost"} size="sm" asChild>
              <Link href={href({ visao: value })} scroll={false} aria-current={view === value ? "page" : undefined}>
                {value === "day" ? "Dia" : "Semana"}
              </Link>
            </Button>
          ))}
        </nav>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <AgendaDatePicker date={date} />
        <FilterSelect
          param="profissional"
          label="Profissional"
          allLabel="Todos os profissionais"
          className="sm:w-56"
          options={professionals.map((item) => ({ value: item.userId, label: item.fullName }))}
        />
        <FilterSelect
          param="status"
          label="Situação"
          allLabel="Todas as situações"
          options={APPOINTMENT_STATUS_FILTERS.map((value) => ({ value, label: APPOINTMENT_STATUS_LABELS[value] }))}
        />
        {(params.status || params.profissional) && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={href({ status: undefined, profissional: undefined })} scroll={false}>
              Limpar filtros
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
