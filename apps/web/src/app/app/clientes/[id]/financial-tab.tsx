import { AlertTriangle, CircleDollarSign, Clock, HandCoins } from "lucide-react";
import { MetricCard } from "@/components/data/metric-card";
import { MoneyValue } from "@/components/data/money-value";
import { StatusBadge } from "@/components/data/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { AccessDenied } from "@/components/feedback/access-denied";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calendarDate } from "@/domains/agenda/calendar";
import { EntryActions, installmentLabel, NewEntryDialog } from "@/domains/financial/components/entry-forms";
import { isOverdue, listCustomerEntries, summarizeEntries, type FinancialEntryRow } from "@/domains/financial/queries";
import type { TenantContext } from "@/domains/tenants/context";
import { getTenantDetails } from "@/domains/tenants/queries";
import { formatDay } from "@/domains/financial/period";

function EntryStatus({ entry, today }: { entry: FinancialEntryRow; today: string }) {
  if (entry.status === "PAID") {
    return <StatusBadge tone="success">Pago em {formatDay(entry.paidAt!)}</StatusBadge>;
  }
  if (entry.status === "CANCELED") return <StatusBadge tone="neutral">Cancelado</StatusBadge>;
  if (isOverdue(entry, today)) return <StatusBadge tone="danger">Atrasado</StatusBadge>;
  if (entry.dueDate === today) return <StatusBadge tone="warning">Vence hoje</StatusBadge>;
  return <StatusBadge tone="info">Em aberto</StatusBadge>;
}

export async function FinancialTab({ context, customerId }: { context: TenantContext; customerId: string }) {
  if (!context.hasModule("financial") || !context.can("financial.read")) return <AccessDenied />;

  const [entries, tenant] = await Promise.all([listCustomerEntries(context, customerId), getTenantDetails(context)]);
  const today = calendarDate(new Date(), tenant.timezone);
  const summary = summarizeEntries(entries, today);
  const canWrite = context.can("financial.write");

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total lançado" value={<MoneyValue value={summary.contracted} />} icon={<CircleDollarSign />} />
        <MetricCard label="Recebido" value={<MoneyValue value={summary.received} />} icon={<HandCoins />} />
        <MetricCard label="Em aberto" value={<MoneyValue value={summary.open} />} icon={<Clock />} />
        <MetricCard
          label="Em atraso"
          value={<MoneyValue value={summary.overdue} />}
          icon={<AlertTriangle />}
          className={summary.overdue > 0 ? "border-danger/40" : undefined}
        />
      </div>

      {canWrite && (
        <div className="flex justify-end">
          <NewEntryDialog customerId={customerId} today={today} />
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          title="Nenhum lançamento"
          description="As parcelas aparecem aqui quando um contrato com valor é assinado. Para sessões avulsas ou contratos antigos, use “Novo lançamento”."
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
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
                      <span className="flex flex-col">
                        <span className={entry.status === "CANCELED" ? "line-through" : undefined}>{entry.description}</span>
                        <span className="text-caption text-muted-foreground">
                          {installmentLabel(entry)}
                          {entry.fromContract ? " · contrato assinado" : ""}
                          {entry.fromAppointment ? " · atendimento da agenda" : ""}
                          {entry.paymentMethod ? ` · ${entry.paymentMethod}` : ""}
                        </span>
                      </span>
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
                        <EntryActions entry={entry} customerId={customerId} today={today} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
