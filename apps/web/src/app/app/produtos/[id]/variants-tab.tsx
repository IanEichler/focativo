import { Layers, Plus } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/data/data-table";
import { MoneyValue } from "@/components/data/money-value";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StockStatusBadge } from "@/domains/catalog/components/product-visuals";
import { VariantRowActions, VariantSheet } from "@/domains/catalog/components/variant-controls";
import type { ProductDetail, VariantDetail } from "@/domains/catalog/queries";
import { formatQuantity } from "@/lib/format";
import type { TenantContext } from "@/domains/tenants/context";

export function VariantsTab({ context, product }: { context: TenantContext; product: ProductDetail }) {
  const canWrite = context.can("catalog.write");
  const addButton = canWrite ? (
    <VariantSheet
      productId={product.id}
      productPrice={product.salePrice}
      canEditCost={product.canSeeCosts}
      trigger={
        <Button>
          <Plus /> Nova variação
        </Button>
      }
    />
  ) : null;

  if (!product.hasVariants) {
    return (
      <EmptyState
        icon={<Layers />}
        title="Produto sem variações"
        description="Use variações quando o mesmo produto existir em sabores, tamanhos ou cores com SKU, preço ou estoque próprios. A primeira variação criada se soma à atual (“Padrão”), que pode ser renomeada."
        action={addButton}
      />
    );
  }

  const columns: DataTableColumn<VariantDetail>[] = [
    {
      id: "name",
      header: "Variação",
      cell: (variant) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{variant.name}</span>
          {variant.isDefault && <Badge variant="secondary">Principal</Badge>}
          {!variant.variantIsActive && <Badge variant="outline">Inativa</Badge>}
        </span>
      ),
    },
    { id: "sku", header: "SKU", hideBelow: "md", cell: (variant) => variant.sku ?? "—" },
    { id: "barcode", header: "Código de barras", hideBelow: "lg", cell: (variant) => variant.barcode ?? "—" },
    {
      id: "price",
      header: "Preço",
      align: "right",
      cell: (variant) => (
        <span className="flex flex-col items-end">
          <MoneyValue value={variant.currentPrice} className={variant.promoPrice !== null ? "text-success" : undefined} />
          {variant.ownSalePrice === null && <span className="text-caption text-muted-foreground">do produto</span>}
        </span>
      ),
    },
    ...(product.canSeeCosts
      ? ([
          {
            id: "cost",
            header: "Custo",
            align: "right",
            hideBelow: "md",
            cell: (variant) => (variant.costPrice !== null ? <MoneyValue value={variant.costPrice} /> : "—"),
          },
        ] as DataTableColumn<VariantDetail>[])
      : []),
    {
      id: "available",
      header: "Disponível",
      align: "right",
      cell: (variant) => formatQuantity(variant.available, product.unit),
    },
    { id: "status", header: "Estoque", hideBelow: "sm", cell: (variant) => <StockStatusBadge status={variant.stockStatus} /> },
    ...(canWrite
      ? ([
          {
            id: "actions",
            header: <span className="sr-only">Ações</span>,
            align: "right",
            className: "w-12",
            cell: (variant) => (
              <VariantRowActions
                productId={product.id}
                productPrice={product.salePrice}
                canEditCost={product.canSeeCosts}
                variant={{
                  id: variant.id,
                  name: variant.name,
                  sku: variant.sku,
                  barcode: variant.barcode,
                  ownSalePrice: variant.ownSalePrice,
                  ownPromoPrice: variant.ownPromoPrice,
                  ownMinStock: variant.ownMinStock,
                  costPrice: variant.costPrice,
                  variantIsActive: variant.variantIsActive,
                }}
              />
            ),
          },
        ] as DataTableColumn<VariantDetail>[])
      : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      {addButton && <div className="flex justify-end">{addButton}</div>}
      <DataTable caption="Variações do produto" columns={columns} rows={product.variants} getRowKey={(variant) => variant.id} />
    </div>
  );
}
