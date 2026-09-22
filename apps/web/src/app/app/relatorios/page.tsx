import { CalendarCheck2, CircleDollarSign, Receipt, ShoppingBag, Trophy, Users } from "lucide-react";
import type { Metadata } from "next";
import { MetricCard } from "@/components/data/metric-card";
import { MoneyValue } from "@/components/data/money-value";
import { StatusBadge } from "@/components/data/status-badge";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader, SectionHeader } from "@/components/layout/page";
import { resolveTab, TabNav } from "@/components/layout/tab-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { stageTone } from "@/domains/crm/labels";
import {
  getAgendaSummary,
  getCrmFunnel,
  getSalesByDay,
  getTopCustomers,
  getTopProducts,
} from "@/domains/reports/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import { buildHref, firstParam } from "@/lib/url";

export const metadata: Metadata = { title: "Relatórios" };

const PERIODS = ["7", "30", "90"] as const;
type Period = (typeof PERIODS)[number];

function sinceFor(period: Period): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Number(period));
  return date.toISOString().slice(0, 10);
}

export default async function ReportsPage({ searchParams }: PageProps<"/app/relatorios">) {
  const context = await requireTenantContext();
  if (!context.can("financial.read") || !context.hasModule("financial")) {
    return (
      <PageContainer>
        <PageHeader title="Relatórios" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const params = await searchParams;
  const period = resolveTab(firstParam(params.periodo), PERIODS, "30");
  const since = sinceFor(period);

  const showSales = context.hasModule("sales");
  const showCrm = context.hasModule("crm");
  const showAgenda = context.hasModule("agenda");

  const [salesByDay, topProducts, topCustomers, crmFunnel, agendaSummary] = await Promise.all([
    showSales ? getSalesByDay(context, since) : Promise.resolve([]),
    showSales ? getTopProducts(context, since, 10) : Promise.resolve([]),
    showSales ? getTopCustomers(context, since, 10) : Promise.resolve([]),
    showCrm ? getCrmFunnel(context, since) : Promise.resolve([]),
    showAgenda ? getAgendaSummary(context, since) : Promise.resolve(null),
  ]);

  const revenue = salesByDay.reduce((sum, row) => sum + row.revenue, 0);
  const salesCount = salesByDay.reduce((sum, row) => sum + row.salesCount, 0);
  const avgTicket = salesCount > 0 ? revenue / salesCount : 0;

  const hasAnySection = showSales || showCrm || showAgenda;

  return (
    <PageContainer>
      <PageHeader
        title="Relatórios"
        description="Inteligência comercial: desempenho de vendas, produtos e clientes, funil de CRM e agenda."
      />

      <TabNav
        label="Período"
        active={period}
        items={PERIODS.map((value) => ({
          id: value,
          label: `${value} dias`,
          href: buildHref("/app/relatorios", params, { periodo: value }),
        }))}
      />

      {!hasAnySection && (
        <EmptyState
          title="Nenhum módulo comercial ativo"
          description="Ative vendas, CRM ou agenda para ver relatórios aqui."
        />
      )}

      {showSales && (
        <section className="flex flex-col gap-4">
          <SectionHeader title="Desempenho de vendas" description={`Últimos ${period} dias`} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Faturamento" value={<MoneyValue value={revenue} />} icon={<CircleDollarSign />} />
            <MetricCard label="Vendas" value={formatNumber(salesCount)} icon={<Receipt />} />
            <MetricCard label="Ticket médio" value={<MoneyValue value={avgTicket} />} icon={<ShoppingBag />} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="size-4 text-muted-foreground" /> Produtos mais vendidos
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topProducts.length === 0 ? (
                  <p className="text-small text-muted-foreground">Nenhuma venda no período.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Qtd.</TableHead>
                        <TableHead className="text-right">Receita</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topProducts.map((row) => (
                        <TableRow key={row.variantId}>
                          <TableCell>
                            <span className="flex flex-col">
                              <span>{row.productName}</span>
                              {row.variantName !== "Padrão" && (
                                <span className="text-caption text-muted-foreground">{row.variantName}</span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular">{formatNumber(row.quantitySold)}</TableCell>
                          <TableCell className="text-right">
                            <MoneyValue value={row.revenue} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" /> Clientes que mais compraram
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topCustomers.length === 0 ? (
                  <p className="text-small text-muted-foreground">Nenhuma venda no período.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Compras</TableHead>
                        <TableHead className="text-right">Total gasto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topCustomers.map((row) => (
                        <TableRow key={row.customerId}>
                          <TableCell>{row.customerName}</TableCell>
                          <TableCell className="text-right tabular">{formatNumber(row.purchaseCount)}</TableCell>
                          <TableCell className="text-right">
                            <MoneyValue value={row.totalSpent} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Vendas por dia</CardTitle>
            </CardHeader>
            <CardContent>
              {salesByDay.length === 0 ? (
                <p className="text-small text-muted-foreground">Nenhuma venda no período.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dia</TableHead>
                      <TableHead className="text-right">Vendas</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...salesByDay].reverse().map((row) => (
                      <TableRow key={row.day}>
                        <TableCell className="text-muted-foreground">{formatDate(row.day)}</TableCell>
                        <TableCell className="text-right tabular">{formatNumber(row.salesCount)}</TableCell>
                        <TableCell className="text-right">
                          <MoneyValue value={row.revenue} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {showCrm && (
        <section className="flex flex-col gap-4">
          <SectionHeader title="Funil de CRM" description={`Oportunidades criadas nos últimos ${period} dias`} />
          <Card>
            <CardContent className="pt-5">
              {crmFunnel.every((stage) => stage.opportunityCount === 0) ? (
                <p className="text-small text-muted-foreground">Nenhuma oportunidade criada no período.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Etapa</TableHead>
                      <TableHead className="text-right">Oportunidades</TableHead>
                      <TableHead className="text-right">Ganhas</TableHead>
                      <TableHead className="text-right">Perdidas</TableHead>
                      <TableHead className="text-right">Taxa de vitória</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {crmFunnel.map((stage) => {
                      const decided = stage.wonCount + stage.lostCount;
                      const winRate = decided > 0 ? stage.wonCount / decided : null;
                      return (
                        <TableRow key={stage.stageId}>
                          <TableCell>
                            <StatusBadge tone={stageTone(stage.stageColor)}>{stage.stageName}</StatusBadge>
                          </TableCell>
                          <TableCell className="text-right tabular">{formatNumber(stage.opportunityCount)}</TableCell>
                          <TableCell className="text-right text-success tabular">
                            {formatNumber(stage.wonCount)}
                          </TableCell>
                          <TableCell className="text-right text-danger tabular">
                            {formatNumber(stage.lostCount)}
                          </TableCell>
                          <TableCell className="text-right tabular">
                            {winRate === null ? "—" : formatPercent(winRate)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {showAgenda && agendaSummary && (
        <section className="flex flex-col gap-4">
          <SectionHeader title="Agenda" description={`Últimos ${period} dias`} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Agendamentos"
              value={formatNumber(agendaSummary.appointmentsCount)}
              icon={<CalendarCheck2 />}
            />
            <MetricCard label="Concluídos" value={formatNumber(agendaSummary.completedCount)} icon={<Trophy />} />
            <MetricCard
              label="Faltas / cancelados"
              value={formatNumber(agendaSummary.noShowCount + agendaSummary.canceledCount)}
              icon={<Users />}
              className={agendaSummary.noShowCount + agendaSummary.canceledCount > 0 ? "border-warning/40" : undefined}
            />
            <MetricCard
              label="Faturamento"
              value={<MoneyValue value={agendaSummary.revenue} />}
              icon={<CircleDollarSign />}
            />
          </div>
        </section>
      )}
    </PageContainer>
  );
}
