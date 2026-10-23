import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, CircleDollarSign, HandCoins } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, FilterSelect, SearchInput } from "@/components/data/filter-controls";
import { MetricCard } from "@/components/data/metric-card";
import { MoneyValue } from "@/components/data/money-value";
import { StatusBadge } from "@/components/data/status-badge";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader, SectionHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calendarDate } from "@/domains/agenda/calendar";
import { EntryActions, installmentLabel, NewEntryDialog } from "@/domains/financial/components/entry-forms";
import { formatDay, monthLabel, monthRange, shiftMonth, validMonth } from "@/domains/financial/period";
import {
  ENTRY_SITUATIONS,
  getMonthSummary,
  isOverdue,
  listAttentionEntries,
  listEntries,
  type EntrySituation,
  type FinancialEntryRow,
} from "@/domains/financial/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { getTenantDetails } from "@/domains/tenants/queries";
import { buildHref, firstParam } from "@/lib/url";

export const metadata: Metadata = { title: "Financeiro" };

function EntryStatus({ entry, today }: { entry: FinancialEntryRow; today: string }) {
  if (entry.status === "PAID") return <StatusBadge tone="success">Pago em {formatDay(entry.paidAt!)}</StatusBadge>;
  if (entry.status === "CANCELED") return <StatusBadge tone="neutral">Cancelado</StatusBadge>;
  if (isOverdue(entry, today)) return <StatusBadge tone="danger">Atrasado</StatusBadge>;
  if (entry.dueDate === today) return <StatusBadge tone="warning">Vence hoje</StatusBadge>;
  return <StatusBadge tone="info">Em aberto</StatusBadge>;
}

function EntryDescription({ entry }: { entry: FinancialEntryRow }) {
  return (
    <span className="flex flex-col">
      {entry.customerId ? (
        <Link href={`/app/clientes/${entry.customerId}?aba=financeiro`} className="font-medium hover:underline">
          {entry.customerName ?? "Cliente"}
        </Link>
      ) : (
        <span className="font-medium">Sem cliente</span>
      )}
      <span className={entry.status === "CANCELED" ? "text-small line-through" : "text-small"}>{entry.description}</span>
      <span className="text-caption text-muted-foreground">
        {installmentLabel(entry)}
        {entry.paymentMethod ? ` · ${entry.paymentMethod}` : ""}
      </span>
    </span>
  );
}

function EntriesTable({ entries, today, canWrite }: { entries: FinancialEntryRow[]; today: string; canWrite: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente e descrição</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead>Situação</TableHead>
          {canWrite && <TableHead className="text-right">Ações</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id} className={entry.status === "CANCELED" ? "text-muted-foreground" : undefined}>
            <TableCell>
              <EntryDescription entry={entry} />
            </TableCell>
            <TableCell className="tabular">{formatDay(entry.dueDate)}</TableCell>
            <TableCell className="text-right">
              <MoneyValue value={entry.amount} />
            </TableCell>
            <TableCell>
              <EntryStatus entry={entry} today={today} />
            </TableCell>
            {canWrite && (
              <TableCell>
                <EntryActions entry={entry} today={today} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function FinancialPage({ searchParams }: PageProps<"/app/financeiro">) {
  const context = await requireTenantContext();
  if (!context.can("financial.read") || !context.hasModule("financial")) {
    return (
      <PageContainer>
        <PageHeader title="Financeiro" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const params = await searchParams;
  const tenant = await getTenantDetails(context);
  const today = calendarDate(new Date(), tenant.timezone);
  const currentMonth = today.slice(0, 7);
  const requestedMonth = firstParam(params.mes);
  const month = validMonth(requestedMonth) ? requestedMonth : currentMonth;
  const { from, to } = monthRange(month);
  const requestedSituation = firstParam(params.situacao);
  const situation = ENTRY_SITUATIONS.some((item) => item.value === requestedSituation)
    ? (requestedSituation as EntrySituation)
    : undefined;
  const search = firstParam(params.q);
  const canWrite = context.can("financial.write");

  const [summary, attention, entries] = await Promise.all([
    getMonthSummary(context, { from, to, today }),
    listAttentionEntries(context, today),
    listEntries(context, { from, to, today, situation, search }),
  ]);
  const monthHref = (value: string) => buildHref("/app/financeiro", params, { mes: value === currentMonth ? undefined : value });

  return (
    <PageContainer>
      <PageHeader
        title="Financeiro"
        description="Parcelas a receber das clientes: contratos assinados e lançamentos avulsos."
        actions={canWrite ? <NewEntryDialog today={today} /> : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" asChild aria-label="Mês anterior">
          <Link href={monthHref(shiftMonth(month, -1))} scroll={false}>
            <ChevronLeft />
          </Link>
        </Button>
        <h2 className="min-w-44 text-center text-section">{monthLabel(month)}</h2>
        <Button variant="outline" size="icon-sm" asChild aria-label="Próximo mês">
          <Link href={monthHref(shiftMonth(month, 1))} scroll={false}>
            <ChevronRight />
          </Link>
        </Button>
        {month !== currentMonth && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={monthHref(currentMonth)} scroll={false}>
              Este mês
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Recebido no mês" value={<MoneyValue value={summary.received} />} icon={<HandCoins />} hint="Pelo dia do pagamento" />
        <MetricCard label="A receber no mês" value={<MoneyValue value={summary.receivable} />} icon={<CalendarClock />} hint="Em aberto com vencimento no mês" />
        <MetricCard label="Previsto no mês" value={<MoneyValue value={summary.expected} />} icon={<CircleDollarSign />} hint="Tudo que vence no mês" />
        <MetricCard
          label="Em atraso"
          value={<MoneyValue value={summary.overdue} />}
          icon={<AlertTriangle />}
          hint="Todas as parcelas vencidas"
          className={summary.overdue > 0 ? "border-danger/40" : undefined}
        />
      </div>

      {attention.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Precisa de atenção" description="Parcelas atrasadas e que vencem hoje, de qualquer mês." />
          <Card>
            <CardContent className="pt-5">
              <EntriesTable entries={attention} today={today} canWrite={canWrite} />
            </CardContent>
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Parcelas do mês" description="Pelo vencimento." />
        <FilterBar>
          <SearchInput placeholder="Buscar por cliente…" label="Buscar por cliente" />
          <FilterSelect param="situacao" label="Situação" options={[...ENTRY_SITUATIONS]} allLabel="Todas" />
        </FilterBar>
        {entries.length === 0 ? (
          <EmptyState
            title={situation || search ? "Nada encontrado" : "Nenhuma parcela neste mês"}
            description={
              situation || search
                ? "Tente outra situação ou outro nome."
                : "As parcelas entram quando um contrato com valor é assinado ou por “Novo lançamento”."
            }
          />
        ) : (
          <Card>
            <CardContent className="pt-5">
              <EntriesTable entries={entries} today={today} canWrite={canWrite} />
            </CardContent>
          </Card>
        )}
      </section>
    </PageContainer>
  );
}
