import Link from "next/link";
import { MoneyValue } from "@/components/data/money-value";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  allergenChips,
  attributeChips,
  nutritionChips,
  unknownHighlights,
} from "@/domains/catalog/characteristics";
import { ProductImageEditor } from "@/domains/catalog/components/product-controls";
import { CharacteristicChips, StockStatusBadge } from "@/domains/catalog/components/product-visuals";
import { PRODUCT_UNITS } from "@/domains/catalog/labels";
import { getEffectiveCharacteristics, type ProductDetail } from "@/domains/catalog/queries";
import { formatQuantity } from "@/lib/format";
import type { TenantContext } from "@/domains/tenants/context";
import { formatDateTime } from "@/lib/format";

export async function OverviewTab({ context, product }: { context: TenantContext; product: ProductDetail }) {
  const characteristics = await getEffectiveCharacteristics(product.defaultVariant.id);
  const chips = [
    ...attributeChips(characteristics.attributes),
    ...allergenChips(characteristics.allergens),
    ...nutritionChips(characteristics.nutrition, characteristics.nutrients),
  ];
  const missing = unknownHighlights(characteristics.allergens);

  const totals = product.variants.reduce(
    (acc, variant) => ({
      physical: acc.physical + (variant.physical ?? 0),
      reserved: acc.reserved + (variant.reserved ?? 0),
      available: acc.available + (variant.variantIsActive ? (variant.available ?? 0) : 0),
    }),
    { physical: 0, reserved: 0, available: 0 },
  );
  const unitLabel = PRODUCT_UNITS.find((unit) => unit.value === product.unit)?.label ?? product.unit;
  const simple = !product.hasVariants;

  const rows: [string, React.ReactNode][] = [
    ["Categoria", product.categoryName ?? "—"],
    ["Marca", product.brandName ?? "—"],
    ["Fornecedor", product.supplierName ?? "—"],
    ["Unidade", unitLabel],
    [
      "Preço de venda",
      product.promoPrice !== null ? (
        <span className="inline-flex items-baseline gap-2">
          <MoneyValue value={product.promoPrice} className="font-medium text-success" />
          <MoneyValue value={product.salePrice} className="text-small text-muted-foreground line-through" />
        </span>
      ) : (
        <MoneyValue value={product.salePrice} />
      ),
    ],
    ...(product.canSeeCosts && simple
      ? ([["Custo", product.defaultVariant.costPrice !== null ? <MoneyValue value={product.defaultVariant.costPrice} /> : "—"]] as [string, React.ReactNode][])
      : []),
    ...(simple
      ? ([
          ["SKU", product.defaultVariant.sku ?? "—"],
          ["Código de barras", product.defaultVariant.barcode ?? "—"],
        ] as [string, React.ReactNode][])
      : []),
    ["Estoque mínimo", formatQuantity(product.minStock, product.unit)],
    ["Lotes e validade", product.trackLots ? "Controlados (FEFO)" : "Não controlados"],
    ["Atualizado em", formatDateTime(product.updatedAt)],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[auto_1fr_320px]">
      <Card className="items-start px-5">
        <ProductImageEditor
          productId={product.id}
          productName={product.name}
          imagePath={product.imagePath}
          canEdit={context.can("catalog.write")}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informações</CardTitle>
          {product.description && <CardDescription className="whitespace-pre-line">{product.description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <dt className="text-small text-muted-foreground">{label}</dt>
                <dd className="text-body tabular">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Estoque</CardTitle>
            <CardAction>
              <StockStatusBadge
                status={totals.available <= 0 ? "OUT" : product.variants.some((v) => v.stockStatus === "LOW") ? "LOW" : "OK"}
              />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-metric tabular">{formatQuantity(totals.available, product.unit)}</p>
            <p className="text-small text-muted-foreground">
              disponíveis · {formatQuantity(totals.physical, product.unit)} físico · {formatQuantity(totals.reserved, product.unit)} reservado
            </p>
            {context.can("inventory.read") && (
              <Button variant="outline" size="sm" asChild className="self-start">
                <Link href={`/app/produtos/${product.id}?aba=estoque`}>Ver estoque e lotes</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Características</CardTitle>
            <CardDescription>
              {product.hasVariants ? `Variação principal: ${product.defaultVariant.name}` : "Segundo o cadastro"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <CharacteristicChips chips={chips} empty="Nenhuma característica cadastrada." />
            {missing.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-caption text-muted-foreground">Pendente de cadastro:</p>
                <CharacteristicChips chips={missing} />
              </div>
            )}
            <Button variant="outline" size="sm" asChild className="self-start">
              <Link href={`/app/produtos/${product.id}?aba=caracteristicas`}>
                {context.can("catalog.write") ? "Editar características" : "Ver detalhes"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
