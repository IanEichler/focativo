import {
  CalendarClock,
  CalendarX2,
  ChartNoAxesColumn,
  CircleDollarSign,
  PackageMinus,
  PackageX,
  Receipt,
  ShoppingBag,
  UserPlus,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MetricCard } from "@/components/data/metric-card";
import { MoneyValue } from "@/components/data/money-value";
import { StatusBadge } from "@/components/data/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader, SectionHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTodayAgendaSummary } from "@/domains/agenda/queries";
import { getInventorySummary } from "@/domains/inventory/queries";
import { getSalesByDay, getTopProducts } from "@/domains/reports/queries";
import { OnboardingSteps } from "@/domains/tenants/components/onboarding-steps";
import { requireTenantContext } from "@/domains/tenants/context";
import { completedSteps } from "@/domains/tenants/onboarding";
import { getSetupProgress, getTeamSummary, getTenantDetails } from "@/domains/tenants/queries";
import { TENANT_SEGMENTS } from "@/domains/tenants/schemas";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

const DASHBOARD_PERIOD_DAYS = 30;

function sinceDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const context = await requireTenantContext();
  const canSeeInventory = context.can("inventory.read") && context.hasModule("inventory");
  const canSeeCommercial = context.can("financial.read") && context.hasModule("sales");
  const canSeeAgenda = context.can("agenda.read") && context.hasModule("agenda");
  const since = sinceDaysAgo(DASHBOARD_PERIOD_DAYS);

  const [details, team, progress, inventory, salesByDay, topProducts, todayAgenda] = await Promise.all([
    getTenantDetails(context),
    getTeamSummary(context),
    getSetupProgress(context),
    canSeeInventory ? getInventorySummary(context) : Promise.resolve(null),
    canSeeCommercial ? getSalesByDay(context, since) : Promise.resolve([]),
    canSeeCommercial ? getTopProducts(context, since, 5) : Promise.resolve([]),
    canSeeAgenda ? getTodayAgendaSummary(context) : Promise.resolve(null),
  ]);

  const revenue = salesByDay.reduce((sum, row) => sum + row.revenue, 0);
  const salesCount = salesByDay.reduce((sum, row) => sum + row.salesCount, 0);
  const avgTicket = salesCount > 0 ? revenue / salesCount : 0;

  const firstName = context.user.fullName.split(" ")[0];
  const completed = completedSteps({
    hasCompany: true,
    legalName: details.legalName,
    document: details.document,
    phone: details.phone,
    productCount: progress.productCount,
    stockedItemCount: progress.stockedItemCount,
  });
  const nextStep = (["company_details", "products", "stock"] as const).find((step) => !completed.has(step));
  const segment = TENANT_SEGMENTS.find((item) => item.value === details.segment)?.label ?? details.segment;

  return (
    <PageContainer>
      <PageHeader
        title={firstName ? `Olá, ${firstName}` : "Dashboard"}
        description={`${details.name} · visão geral da operação`}
      />

      {inventory && (
        <section className="flex flex-col gap-4">
          <SectionHeader
            title="Alertas de estoque"
            actions={
              <Button variant="outline" size="sm" asChild>
                <Link href="/app/estoque">Ver estoque</Link>
              </Button>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Estoque baixo",
                value: inventory.lowStock,
                icon: <PackageMinus />,
                href: "/app/estoque?status=LOW",
              },
              {
                label: "Sem estoque",
                value: inventory.outOfStock,
                icon: <PackageX />,
                href: "/app/estoque?status=OUT",
              },
              {
                label: "Lotes vencendo",
                value: inventory.expiringLots,
                icon: <CalendarClock />,
                href: "/app/estoque?aba=lotes&status=EXPIRING",
                hint: `próximos ${inventory.expiryAlertDays} dias`,
              },
              {
                label: "Lotes vencidos",
                value: inventory.expiredLots,
                icon: <CalendarX2 />,
                href: "/app/estoque?aba=lotes&status=EXPIRED",
                hint: "com saldo",
              },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <MetricCard
                  label={item.label}
                  value={formatNumber(item.value)}
                  icon={item.icon}
                  hint={item.hint}
                  className={item.value > 0 ? "border-warning/40" : undefined}
                />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Primeiros passos</CardTitle>
            <CardDescription>Conclua a configuração para começar a vender com atendimento assistido.</CardDescription>
          </CardHeader>
          <CardContent>
            <OnboardingSteps completed={completed} current={nextStep} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Empresa</CardTitle>
              <CardAction>
                <StatusBadge tone={details.status === "ACTIVE" ? "success" : "warning"}>
                  {details.status === "ACTIVE" ? "Ativa" : details.status === "SUSPENDED" ? "Suspensa" : "Cancelada"}
                </StatusBadge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
                <dt className="text-muted-foreground">Nome</dt>
                <dd className="truncate text-right font-medium">{details.name}</dd>
                <dt className="text-muted-foreground">Segmento</dt>
                <dd className="truncate text-right">{segment}</dd>
                <dt className="text-muted-foreground">Seu papel</dt>
                <dd className="text-right">{context.tenant.roleName}</dd>
                <dt className="text-muted-foreground">Desde</dt>
                <dd className="text-right tabular">{formatDate(details.createdAt)}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Equipe</CardTitle>
              {context.can("users.invite") && (
                <CardAction>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/app/usuarios">
                      <UserPlus /> Convidar
                    </Link>
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="flex items-end gap-8">
              <div>
                <p className="text-metric tabular">{formatNumber(team.active)}</p>
                <p className="text-small text-muted-foreground">
                  {team.active === 1 ? "usuário ativo" : "usuários ativos"}
                </p>
              </div>
              <div>
                <p className="text-metric text-muted-foreground tabular">{formatNumber(team.invited)}</p>
                <p className="text-small text-muted-foreground">
                  {team.invited === 1 ? "convite pendente" : "convites pendentes"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {canSeeCommercial && (
        <section className="flex flex-col gap-4">
          <SectionHeader
            title="Indicadores comerciais"
            description={`Últimos ${DASHBOARD_PERIOD_DAYS} dias`}
            actions={
              <Button variant="outline" size="sm" asChild>
                <Link href="/app/relatorios">Ver relatórios</Link>
              </Button>
            }
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard label="Faturamento" value={<MoneyValue value={revenue} />} icon={<CircleDollarSign />} />
            <MetricCard label="Vendas" value={formatNumber(salesCount)} icon={<Receipt />} />
            <MetricCard label="Ticket médio" value={<MoneyValue value={avgTicket} />} icon={<ShoppingBag />} />
          </div>

          {topProducts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Produtos mais vendidos</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border">
                {topProducts.map((row) => (
                  <div key={row.variantId} className="flex items-center justify-between gap-4 py-2.5 text-body">
                    <span className="truncate">{row.productName}</span>
                    <span className="flex shrink-0 items-center gap-4 text-muted-foreground tabular">
                      {formatNumber(row.quantitySold)} un. <MoneyValue value={row.revenue} />
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {canSeeAgenda && todayAgenda && (
        <section className="flex flex-col gap-4">
          <SectionHeader
            title="Agenda de hoje"
            actions={
              <Button variant="outline" size="sm" asChild>
                <Link href="/app/agenda">Ver agenda</Link>
              </Button>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard label="Compromissos hoje" value={formatNumber(todayAgenda.count)} icon={<CalendarClock />} />
            <MetricCard
              label="Próximo horário"
              value={todayAgenda.nextStartsAt ? formatDateTime(todayAgenda.nextStartsAt) : "—"}
            />
          </div>
        </section>
      )}

      {!canSeeCommercial && !canSeeAgenda && (
        <EmptyState
          icon={<ChartNoAxesColumn />}
          title="Indicadores comerciais"
          description="Faturamento, vendas, ticket médio e produtos mais vendidos aparecerão aqui quando você tiver acesso ao financeiro."
        />
      )}
    </PageContainer>
  );
}
