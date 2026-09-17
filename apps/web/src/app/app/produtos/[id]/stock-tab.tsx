import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/data/data-table";
import { EmptyState } from "@/components/feedback/empty-state";
import { AccessDenied } from "@/components/feedback/access-denied";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StockStatusBadge } from "@/domains/catalog/components/product-visuals";
import { getCatalogOptions, type ProductDetail, type VariantDetail } from "@/domains/catalog/queries";
import { LotsTable, MovementsTable } from "@/domains/inventory/components/inventory-tables";
import { StockRowActions } from "@/domains/inventory/components/stock-row-actions";
import { formatQuantity } from "@/lib/format";
import { listMovements, listProductLots } from "@/domains/inventory/queries";
import type { TenantContext } from "@/domains/tenants/context";

export async function StockTab({ context, product }: { context: TenantContext; product: ProductDetail }) {
  if (!context.can("inventory.read")) return <AccessDenied />;

  const canHistory = context.can("inventory.history");
  const permissions = {
    entry: context.can("inventory.entry"),
    adjust: context.can("inventory.adjust"),
    costs: context.can("catalog.costs"),
  };

  const [lots, movements, options] = await Promise.all([
    product.trackLots ? listProductLots(context, product.id) : Promise.resolve([]),
    canHistory ? listMovements(context, { productId: product.id, page: 1, pageSize: 10 }) : Promise.resolve(null),
    permissions.entry && product.trackLots ? getCatalogOptions(context) : Promise.resolve(null),
  ]);
  const suppliers = (options?.suppliers ?? []).filter((supplier) => supplier.isActive);

  const columns: DataTableColumn<VariantDetail>[] = [
    ...(product.hasVariants
      ? ([{ id: "name", header: "Variação", cell: (variant) => <span className="font-medium">{variant.name}</span> }] as DataTableColumn<VariantDetail>[])
      : []),
    { id: "physical", header: "Físico", align: "right", cell: (variant) => formatQuantity(variant.physical, product.unit) },
    { id: "reserved", header: "Reservado", align: "right", cell: (variant) => formatQuantity(variant.reserved, product.unit) },
    {
      id: "available",
      header: "Disponível",
      align: "right",
      cell: (variant) => <span className="font-medium">{formatQuantity(variant.available, product.unit)}</span>,
    },
    { id: "min", header: "Mínimo", align: "right", hideBelow: "sm", cell: (variant) => formatQuantity(variant.minStock, product.unit) },
    { id: "status", header: "Situação", cell: (variant) => <StockStatusBadge status={variant.stockStatus} /> },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      align: "right",
      className: "w-12",
      cell: (variant) => (
        <StockRowActions
          permissions={permissions}
          suppliers={suppliers}
          variant={{
            variantId: variant.id,
            productId: product.id,
            label: product.hasVariants ? `${product.name} — ${variant.name}` : product.name,
            sku: variant.sku,
            unit: product.unit,
            trackLots: product.trackLots,
            physical: variant.physical ?? 0,
            available: variant.available ?? 0,
          }}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <DataTable caption="Estoque por variação" columns={columns} rows={product.variants} getRowKey={(variant) => variant.id} />

      {product.trackLots && (
        <section className="flex flex-col gap-3">
          <h2 className="text-section">Lotes</h2>
          <LotsTable
            rows={lots}
            unit={product.unit}
            showProduct={product.hasVariants}
            empty={<EmptyState className="border-0" title="Nenhum lote" description="Os lotes são criados nas entradas de estoque." />}
          />
        </section>
      )}

      {movements && (
        <Card>
          <CardHeader>
            <CardTitle>Últimas movimentações</CardTitle>
            <CardAction>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/app/estoque?aba=movimentacoes&produto=${product.id}`}>Ver histórico completo</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <MovementsTable
              rows={movements.rows}
              showProduct={false}
              showCosts={permissions.costs}
              empty={<EmptyState className="border-0" title="Sem movimentações" description="Registre a primeira entrada deste produto." />}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
