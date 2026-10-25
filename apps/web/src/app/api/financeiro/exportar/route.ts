import { NextResponse } from "next/server";
import { calendarDate } from "@/domains/agenda/calendar";
import { listEntriesForExport } from "@/domains/financial/queries";
import { entriesToCsv, REPORT_PERIODS, reportRange, type ReportPeriod } from "@/domains/financial/report";
import { getTenantContext } from "@/domains/tenants/context";
import { getTenantDetails } from "@/domains/tenants/queries";
import { logger } from "@/lib/logger";

/** Planilha (CSV para Excel) com receitas e despesas que vencem ou foram pagas no período. */
export async function GET(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!context.hasModule("financial") || !context.can("financial.read")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const requested = new URL(request.url).searchParams.get("periodo");
  const period = (REPORT_PERIODS.some((item) => item.value === requested) ? requested : "mes") as ReportPeriod;
  const tenant = await getTenantDetails(context);
  const { from, to } = reportRange(period, calendarDate(new Date(), tenant.timezone));

  const entries = await listEntriesForExport(context, from, to);
  logger.info({ event: "financial.export", status: "ok", tenant_id: context.tenant.id, rows: entries.length });
  return new NextResponse(entriesToCsv(entries), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="financeiro-${from}-a-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
