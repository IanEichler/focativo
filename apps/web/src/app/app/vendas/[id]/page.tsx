import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/data/status-badge";
import { MoneyValue } from "@/components/data/money-value";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CancelSaleButton } from "./cancel-sale-button";
import { paymentMethodLabel, saleOriginLabel } from "@/domains/sales/labels";
import { getSaleDetail } from "@/domains/sales/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Venda" };

export default async function SaleDetailPage({ params }: PageProps<"/app/vendas/[id]">) {
  const context = await requireTenantContext();
  const { id } = await params;
  if (!context.can("sales.read") || !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const sale = await getSaleDetail(context, id);
  if (!sale) notFound();

  const canSeeCosts = context.can("catalog.costs");
  const canWrite = context.can("sales.write");

  return (
    <PageContainer>
      <div>
        <Link
          href="/app/vendas"
          className="inline-flex items-center gap-1.5 text-small text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-4" /> Vendas
        </Link>
      </div>

      <PageHeader
        title={sale.customerName ?? "Cliente não identificado"}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{formatDateTime(sale.createdAt)}</span>
            <span>· {saleOriginLabel(sale.origin)}</span>
            {sale.canceledAt ? (
              <StatusBadge tone="danger">Cancelada</StatusBadge>
            ) : (
              <StatusBadge tone="success">Concluída</StatusBadge>
            )}
          </span>
        }
        actions={canWrite && !sale.canceledAt ? <CancelSaleButton saleId={sale.id} /> : undefined}
      />

      {sale.canceledAt && (
        <Card className="border-danger/40">
          <CardContent className="py-4 text-body text-danger">
            Cancelada em {formatDateTime(sale.canceledAt)}
            {sale.canceledReason ? ` — ${sale.canceledReason}` : ""}. O estoque foi estornado.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Itens</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                {canSeeCosts && <TableHead className="text-right">Custo</TableHead>}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sale.items.map((item) => (
                <TableRow key={item.variantId}>
                  <TableCell>
                    {item.variantName !== item.productName
                      ? `${item.productName} — ${item.variantName}`
                      : item.productName}
                  </TableCell>
                  <TableCell className="text-right tabular">{item.quantity}</TableCell>
                  <TableCell className="text-right">
                    <MoneyValue value={item.unitPrice} />
                  </TableCell>
                  {canSeeCosts && (
                    <TableCell className="text-right">
                      {item.unitCost !== null ? <MoneyValue value={item.unitCost} /> : "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <MoneyValue value={item.lineTotal} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <dl className="mt-4 flex flex-col items-end gap-1 text-body">
            <div className="flex gap-4">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="w-24 text-right tabular">
                <MoneyValue value={sale.subtotal} />
              </dd>
            </div>
            {sale.discountAmount > 0 && (
              <div className="flex gap-4">
                <dt className="text-muted-foreground">Desconto</dt>
                <dd className="w-24 text-right text-danger tabular">
                  -<MoneyValue value={sale.discountAmount} />
                </dd>
              </div>
            )}
            <div className="flex gap-4 font-semibold">
              <dt>Total</dt>
              <dd className="w-24 text-right tabular">
                <MoneyValue value={sale.total} />
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagamento</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
            <dt className="text-muted-foreground">Forma</dt>
            <dd className="text-right">{paymentMethodLabel(sale.paymentMethod)}</dd>
            <dt className="text-muted-foreground">Valor pago</dt>
            <dd className="text-right">{sale.paidAmount !== null ? <MoneyValue value={sale.paidAmount} /> : "—"}</dd>
            <dt className="text-muted-foreground">Responsável</dt>
            <dd className="text-right">{sale.responsibleName ?? "—"}</dd>
          </dl>
          {sale.notes && <p className="mt-3 text-small text-muted-foreground">{sale.notes}</p>}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
