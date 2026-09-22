import { CircleDollarSign, Clock, HandCoins, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MetricCard } from "@/components/data/metric-card";
import { MoneyValue } from "@/components/data/money-value";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader, SectionHeader } from "@/components/layout/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { paymentMethodLabel } from "@/domains/sales/labels";
import { getFinancialSummary, listPendingCharges, listReceivables } from "@/domains/payments/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Financeiro" };

export default async function FinancialPage() {
  const context = await requireTenantContext();
  if (!context.can("financial.read") || !context.hasModule("financial")) {
    return (
      <PageContainer>
        <PageHeader title="Financeiro" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const [summary, receivables, pendingCharges] = await Promise.all([
    getFinancialSummary(context),
    listReceivables(context),
    listPendingCharges(context),
  ]);

  const methodEntries = Object.entries(summary.byMethod).sort(([, a], [, b]) => b - a);

  return (
    <PageContainer>
      <PageHeader
        title="Financeiro"
        description="Visão operacional: receita, recebido, pendente e contas a receber. Não substitui contabilidade."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Receita"
          value={<MoneyValue value={summary.revenue} />}
          icon={<CircleDollarSign />}
          hint={`${summary.salesCount} vendas`}
        />
        <MetricCard label="Recebido" value={<MoneyValue value={summary.received} />} icon={<HandCoins />} />
        <MetricCard
          label="Pendente"
          value={<MoneyValue value={summary.pending} />}
          icon={<Clock />}
          className={summary.pending > 0 ? "border-warning/40" : undefined}
        />
        <MetricCard label="Cobranças aguardando" value={pendingCharges.length} icon={<Receipt />} hint="PIX/online" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Formas de pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            {methodEntries.length === 0 ? (
              <p className="text-small text-muted-foreground">Nenhuma venda registrada ainda.</p>
            ) : (
              <dl className="flex flex-col gap-2">
                {methodEntries.map(([method, total]) => (
                  <div key={method} className="flex items-center justify-between gap-4 text-body">
                    <dt className="text-muted-foreground">
                      {paymentMethodLabel(method === "nao_informado" ? null : method)}
                    </dt>
                    <dd className="tabular">
                      <MoneyValue value={total} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cobranças aguardando pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingCharges.length === 0 ? (
              <p className="text-small text-muted-foreground">Nenhuma cobrança pendente.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {pendingCharges.map((charge) => (
                  <Link
                    key={charge.id}
                    href={`/app/reservas/${charge.reservationId}`}
                    className="flex items-center justify-between gap-3 py-2.5 hover:underline"
                  >
                    <span className="flex flex-col">
                      <span className="text-body">{charge.customerName ?? "Cliente"}</span>
                      <span className="text-caption text-muted-foreground">{formatDateTime(charge.createdAt)}</span>
                    </span>
                    <MoneyValue value={charge.amount} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <SectionHeader title="Contas a receber" />
      {receivables.length === 0 ? (
        <EmptyState
          className="border-0"
          title="Nada a receber"
          description="Todas as vendas confirmadas estão quitadas."
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivables.map((receivable) => (
                  <TableRow key={receivable.saleId}>
                    <TableCell>
                      <Link href={`/app/vendas/${receivable.saleId}`} className="hover:underline">
                        {receivable.customerName ?? "Cliente não identificado"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(receivable.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <MoneyValue value={receivable.total} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyValue value={receivable.paidAmount} />
                    </TableCell>
                    <TableCell className="text-right font-medium text-warning">
                      <MoneyValue value={receivable.balance} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
