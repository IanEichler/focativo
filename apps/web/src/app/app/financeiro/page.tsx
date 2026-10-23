import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, CircleDollarSign, HandCoins, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, FilterSelect, SearchInput } from "@/components/data/filter-controls";
import { MetricCard } from "@/components/data/metric-card";
import { MoneyValue } from "@/components/data/money-value";
import { StatusBadge } from "@/components/data/status-badge";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader, SectionHeader } from "@/components/layout/page";
import { resolveTab, TabNav } from "@/components/layout/tab-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calendarDate } from "@/domains/agenda/calendar";
import { CashFlowChart } from "@/domains/financial/components/cash-flow-chart";
import { EntryActions, installmentLabel, NewEntryDialog } from "@/domains/financial/components/entry-forms";
import { NewExpenseDialog, RecurringExpensesCard } from "@/domains/financial/components/expense-forms";
import { formatDay, monthLabel, monthRange, shiftMonth, validMonth } from "@/domains/financial/period";
import {
  ENTRY_SITUATIONS,
  getCashFlow,
  getMonthSummary,
  isOverdue,
  listActiveRecurringExpenses,
  listAttentionEntries,
  listEntries,
  listExpenseCategories,
  type EntryKind,
  type EntrySituation,
  type FinancialEntryRow,
} from "@/domains/financial/queries";
import { requireTenantContext, type TenantContext } from "@/domains/tenants/context";
import { getTenantDetails } from "@/domains/tenants/queries";
import { cn } from "@/lib/utils";
import { buildHref, firstParam, type SearchParamsRecord } from "@/lib/url";

export const metadata: Metadata = { title: "Financeiro" };

const TABS = ["receber", "despesas", "fluxo"] as const;

function EntryStatus({ entry, today }: { entry: FinancialEntryRow; today: string }) {
  if (entry.status === "PAID") return <StatusBadge tone="success">Pago em {formatDay(entry.paidAt!)}</StatusBadge>;
  if (entry.status === "CANCELED") return <StatusBadge tone="neutral">Cancelado</StatusBadge>;
  if (isOverdue(entry, today)) return <StatusBadge tone="danger">Atrasado</StatusBadge>;
  if (entry.dueDate === today) return <StatusBadge tone="warning">Vence hoje</StatusBadge>;
  return <StatusBadge tone="info">Em aberto</StatusBadge>;
}

function EntryDescription({ entry, kind }: { entry: FinancialEntryRow; kind: EntryKind }) {
  const details = [
    entry.installmentCount > 1 ? installmentLabel(entry) : null,
    entry.fromRecurring ? "Despesa fixa" : null,
    entry.fromAppointment ? "Atendimento da agenda" : null,
    entry.fromContract ? "Contrato assinado" : null,
    kind === "INCOME" ? null : entry.category,
    entry.paymentMethod,
  ].filter(Boolean);
  return (
    <span className="flex flex-col">
      {kind === "INCOME" ? (
        <>
          {entry.customerId ? (
            <Link href={`/app/clientes/${entry.customerId}?aba=financeiro`} className="font-medium hover:underline">
              {entry.customerName ?? "Cliente"}
            </Link>
          ) : (
            <span className="font-medium">Sem cliente</span>
          )}
          <span className={cn("text-small", entry.status === "CANCELED" && "line-through")}>{entry.description}</span>
        </>
      ) : (
        <span className={cn("font-medium", entry.status === "CANCELED" && "line-through")}>{entry.description}</span>
      )}
      {details.length > 0 && <span className="text-caption text-muted-foreground">{details.join(" · ")}</span>}
    </span>
  );
}

function EntriesTable({
  entries,
  kind,
  today,
  canWrite,
}: {
  entries: FinancialEntryRow[];
  kind: EntryKind;
  today: string;
  canWrite: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{kind === "INCOME" ? "Cliente e descrição" : "Despesa"}</TableHead>
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
              <EntryDescription entry={entry} kind={kind} />
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

function MonthNav({ month, currentMonth, href }: { month: string; currentMonth: string; href: (month: string) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon-sm" asChild aria-label="Mês anterior">
        <Link href={href(shiftMonth(month, -1))} scroll={false}>
          <ChevronLeft />
        </Link>
      </Button>
      <h2 className="min-w-44 text-center text-section">{monthLabel(month)}</h2>
      <Button variant="outline" size="icon-sm" asChild aria-label="Próximo mês">
        <Link href={href(shiftMonth(month, 1))} scroll={false}>
          <ChevronRight />
        </Link>
      </Button>
      {month !== currentMonth && (
        <Button variant="ghost" size="sm" asChild>
          <Link href={href(currentMonth)} scroll={false}>
            Este mês
          </Link>
        </Button>
      )}
    </div>
  );
}

/** A receber e Despesas: mesma estrutura, mudam o tipo, os textos e o botão de lançar. */
async function EntriesTab({
  context,
  kind,
  month,
  today,
  params,
}: {
  context: TenantContext;
  kind: EntryKind;
  month: string;
  today: string;
  params: SearchParamsRecord;
}) {
  const { from, to } = monthRange(month);
  const requestedSituation = firstParam(params.situacao);
  const situation = ENTRY_SITUATIONS.some((item) => item.value === requestedSituation)
    ? (requestedSituation as EntrySituation)
    : undefined;
  const search = firstParam(params.q);
  const canWrite = context.can("financial.write");
  const income = kind === "INCOME";

  const [summary, attention, entries, recurring] = await Promise.all([
    getMonthSummary(context, { kind, from, to, today }),
    listAttentionEntries(context, kind, today),
    listEntries(context, { kind, from, to, today, situation, search }),
    income ? Promise.resolve([]) : listActiveRecurringExpenses(context),
  ]);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={income ? "Recebido no mês" : "Pago no mês"}
          value={<MoneyValue value={summary.settled} />}
          icon={<HandCoins />}
          hint="Pelo dia do pagamento"
        />
        <MetricCard
          label={income ? "A receber no mês" : "A pagar no mês"}
          value={<MoneyValue value={summary.open} />}
          icon={<CalendarClock />}
          hint="Em aberto com vencimento no mês"
        />
        <MetricCard label="Previsto no mês" value={<MoneyValue value={summary.expected} />} icon={<CircleDollarSign />} hint="Tudo que vence no mês" />
        <MetricCard
          label="Em atraso"
          value={<MoneyValue value={summary.overdue} />}
          icon={<AlertTriangle />}
          hint={income ? "Todas as parcelas vencidas" : "Todas as contas vencidas"}
          className={summary.overdue > 0 ? "border-danger/40" : undefined}
        />
      </div>

      {attention.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Precisa de atenção"
            description={income ? "Parcelas atrasadas e que vencem hoje, de qualquer mês." : "Contas atrasadas e que vencem hoje, de qualquer mês."}
          />
          <Card>
            <CardContent className="pt-5">
              <EntriesTable entries={attention} kind={kind} today={today} canWrite={canWrite} />
            </CardContent>
          </Card>
        </section>
      )}

      {!income && <RecurringExpensesCard items={recurring} canWrite={canWrite} />}

      <section className="flex flex-col gap-3">
        <SectionHeader title={income ? "Parcelas do mês" : "Despesas do mês"} description="Pelo vencimento." />
        <FilterBar>
          <SearchInput
            placeholder={income ? "Buscar por cliente…" : "Buscar por descrição…"}
            label={income ? "Buscar por cliente" : "Buscar por descrição"}
          />
          <FilterSelect param="situacao" label="Situação" options={[...ENTRY_SITUATIONS]} allLabel="Todas" />
        </FilterBar>
        {entries.length === 0 ? (
          <EmptyState
            title={situation || search ? "Nada encontrado" : income ? "Nenhuma parcela neste mês" : "Nenhuma despesa neste mês"}
            description={
              situation || search
                ? "Tente outra situação ou outra busca."
                : income
                  ? "As parcelas entram quando um contrato com valor é assinado ou por “Novo lançamento”."
                  : "Lance contas a pagar em “Nova despesa”; as fixas aparecem aqui todo mês."
            }
          />
        ) : (
          <Card>
            <CardContent className="pt-5">
              <EntriesTable entries={entries} kind={kind} today={today} canWrite={canWrite} />
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}

async function CashFlowTab({ context, currentMonth }: { context: TenantContext; currentMonth: string }) {
  const first = shiftMonth(currentMonth, -5);
  const last = shiftMonth(currentMonth, 6);
  const months = await getCashFlow(context, monthRange(first).from, monthRange(last).to);
  const current = months.find((month) => month.month === currentMonth);
  const balance = (month: (typeof months)[number]) =>
    Math.round((month.incomePaid + month.incomeOpen - month.expensePaid - month.expenseOpen) * 100) / 100;
  const realizedBalance = current ? Math.round((current.incomePaid - current.expensePaid) * 100) / 100 : 0;
  const hasData = months.some((month) => month.incomePaid || month.incomeOpen || month.expensePaid || month.expenseOpen);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Saldo realizado no mês"
          value={<MoneyValue value={realizedBalance} />}
          icon={<Wallet />}
          hint="Recebido − pago neste mês"
        />
        <MetricCard
          label="Saldo previsto no mês"
          value={<MoneyValue value={current ? balance(current) : 0} />}
          icon={<CircleDollarSign />}
          hint="Inclui o que ainda vai entrar e sair"
        />
        <MetricCard
          label="Saldo previsto nos próximos 6 meses"
          value={<MoneyValue value={months.filter((month) => month.month > currentMonth).reduce((total, month) => total + balance(month), 0)} />}
          icon={<CalendarClock />}
          hint="Parcelas a receber − contas e despesas fixas"
        />
      </div>

      {!hasData ? (
        <EmptyState
          title="Sem movimento ainda"
          description="O fluxo de caixa aparece quando houver parcelas a receber ou despesas lançadas."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Entradas e saídas por mês</CardTitle>
            </CardHeader>
            <CardContent>
              <CashFlowChart months={months} currentMonth={currentMonth} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Recebido</TableHead>
                    <TableHead className="text-right">A receber</TableHead>
                    <TableHead className="text-right">Pago</TableHead>
                    <TableHead className="text-right">A pagar</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {months.map((month) => {
                    const value = balance(month);
                    return (
                      <TableRow key={month.month} className={month.month === currentMonth ? "bg-muted/40 font-medium" : undefined}>
                        <TableCell>{monthLabel(month.month)}</TableCell>
                        <TableCell className="text-right"><MoneyValue value={month.incomePaid} /></TableCell>
                        <TableCell className="text-right"><MoneyValue value={month.incomeOpen} /></TableCell>
                        <TableCell className="text-right"><MoneyValue value={month.expensePaid} /></TableCell>
                        <TableCell className="text-right"><MoneyValue value={month.expenseOpen} /></TableCell>
                        <TableCell className={cn("text-right", value < 0 && "text-danger")}>
                          <MoneyValue value={value} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="mt-3 text-small text-muted-foreground">
                “A receber” e “A pagar” incluem o que está atrasado no mês do vencimento e a projeção das despesas fixas.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </>
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
  const tab = resolveTab(firstParam(params.aba), TABS, "receber");
  const tenant = await getTenantDetails(context);
  const today = calendarDate(new Date(), tenant.timezone);
  const currentMonth = today.slice(0, 7);
  const requestedMonth = firstParam(params.mes);
  const month = validMonth(requestedMonth) ? requestedMonth : currentMonth;
  const canWrite = context.can("financial.write");
  const categories = canWrite && tab === "despesas" ? await listExpenseCategories(context) : [];
  const base = "/app/financeiro";
  const tabHref = (id: string) => buildHref(base, {}, { aba: id === "receber" ? undefined : id, mes: month === currentMonth ? undefined : month });

  return (
    <PageContainer>
      <PageHeader
        title="Financeiro"
        description="A receber das clientes, contas a pagar e o fluxo de caixa mês a mês."
        actions={
          canWrite && tab === "receber" ? (
            <NewEntryDialog today={today} />
          ) : canWrite && tab === "despesas" ? (
            <NewExpenseDialog today={today} categories={categories} />
          ) : undefined
        }
      />

      <TabNav
        label="Seções do financeiro"
        active={tab}
        items={[
          { id: "receber", label: "A receber", href: tabHref("receber") },
          { id: "despesas", label: "Despesas", href: tabHref("despesas") },
          { id: "fluxo", label: "Fluxo de caixa", href: tabHref("fluxo") },
        ]}
      />

      {tab !== "fluxo" && (
        <MonthNav
          month={month}
          currentMonth={currentMonth}
          href={(value) => buildHref(base, params, { mes: value === currentMonth ? undefined : value })}
        />
      )}

      {tab === "receber" && <EntriesTab context={context} kind="INCOME" month={month} today={today} params={params} />}
      {tab === "despesas" && <EntriesTab context={context} kind="EXPENSE" month={month} today={today} params={params} />}
      {tab === "fluxo" && <CashFlowTab context={context} currentMonth={currentMonth} />}
    </PageContainer>
  );
}
