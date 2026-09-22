import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerTimeline } from "@/domains/customers/components/customer-timeline";
import { timelineEventLabel } from "@/domains/customers/labels";
import type { CustomerDetail, TimelineEventRow } from "@/domains/customers/queries";
import { formatDate, formatMoney } from "@/lib/format";

export function OverviewTab({ customer, timeline }: { customer: CustomerDetail; timeline: TimelineEventRow[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Contato</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
            <dt className="text-muted-foreground">Telefone</dt>
            <dd className="text-right">{customer.phone ?? "—"}</dd>
            <dt className="text-muted-foreground">WhatsApp</dt>
            <dd className="text-right">{customer.whatsapp ?? "—"}</dd>
            <dt className="text-muted-foreground">E-mail</dt>
            <dd className="truncate text-right">{customer.email ?? "—"}</dd>
            <dt className="text-muted-foreground">CPF/CNPJ</dt>
            <dd className="text-right">{customer.document ?? "—"}</dd>
            <dt className="text-muted-foreground">Aniversário</dt>
            <dd className="text-right">{customer.birthday ? formatDate(customer.birthday) : "—"}</dd>
            <dt className="text-muted-foreground">Responsável</dt>
            <dd className="text-right">{customer.responsibleName ?? "—"}</dd>
            <dt className="text-muted-foreground">Cliente desde</dt>
            <dd className="text-right tabular">{formatDate(customer.createdAt)}</dd>
          </dl>
          {customer.tags.length > 0 && (
            <p className="mt-3 flex flex-wrap gap-1.5 text-small text-muted-foreground">
              Tags: {customer.tags.join(", ")}
            </p>
          )}
          {customer.notes && <p className="mt-3 text-small text-muted-foreground">{customer.notes}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de compras</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-end gap-8">
            <div>
              <p className="text-metric tabular">{formatMoney(customer.totalSpent)}</p>
              <p className="text-small text-muted-foreground">total gasto</p>
            </div>
            <div>
              <p className="text-metric tabular">{customer.purchaseCount}</p>
              <p className="text-small text-muted-foreground">{customer.purchaseCount === 1 ? "compra" : "compras"}</p>
            </div>
          </div>
          <p className="text-small text-muted-foreground">
            Ticket médio: {customer.averageTicket !== null ? formatMoney(customer.averageTicket) : "—"}
            {" · "}
            Última compra: {customer.lastPurchaseAt ? formatDate(customer.lastPurchaseAt) : "—"}
          </p>
          <p className="text-caption text-subtle">Disponível a partir do módulo de vendas.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Atividade recente</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerTimeline events={timeline} labelFor={timelineEventLabel} />
        </CardContent>
      </Card>
    </div>
  );
}
