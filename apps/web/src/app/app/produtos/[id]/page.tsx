import { ArrowLeft, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/data/status-badge";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { resolveTab, TabNav } from "@/components/layout/tab-nav";
import { Button } from "@/components/ui/button";
import { ProductStatusMenu } from "@/domains/catalog/components/product-controls";
import { ProductFormSheet } from "@/domains/catalog/components/product-form";
import { getCatalogOptions, getProductDetail } from "@/domains/catalog/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { firstParam } from "@/lib/url";
import { CharacteristicsTab } from "./characteristics-tab";
import { OverviewTab } from "./overview-tab";
import { StockTab } from "./stock-tab";
import { VariantsTab } from "./variants-tab";

export const metadata: Metadata = { title: "Produto" };

const TABS = ["geral", "variacoes", "caracteristicas", "estoque"] as const;

export default async function ProductDetailPage({ params, searchParams }: PageProps<"/app/produtos/[id]">) {
  const context = await requireTenantContext();
  const { id } = await params;
  if (!context.can("catalog.read") || !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const search = await searchParams;
  const tab = resolveTab(firstParam(search.aba), TABS, "geral");
  const product = await getProductDetail(context, id);
  if (!product) notFound();

  const canWrite = context.can("catalog.write");
  const options = canWrite ? await getCatalogOptions(context) : null;
  const base = `/app/produtos/${product.id}`;

  return (
    <PageContainer>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
          <Link href="/app/produtos">
            <ArrowLeft /> Produtos
          </Link>
        </Button>
      </div>

      <PageHeader
        title={product.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge tone={product.isActive ? "success" : "neutral"}>{product.isActive ? "Ativo" : "Inativo"}</StatusBadge>
            {product.categoryName && <span>{product.categoryName}</span>}
            {product.brandName && <span>· {product.brandName}</span>}
          </span>
        }
        actions={
          canWrite && options ? (
            <>
              <ProductFormSheet
                options={options}
                canEditCost={product.canSeeCosts}
                product={{
                  id: product.id,
                  name: product.name,
                  description: product.description,
                  categoryId: product.categoryId,
                  brandId: product.brandId,
                  supplierId: product.supplierId,
                  unit: product.unit,
                  salePrice: product.salePrice,
                  promoPrice: product.promoPrice,
                  costPrice: product.defaultVariant.costPrice,
                  minStock: product.minStock,
                  sku: product.defaultVariant.sku,
                  barcode: product.defaultVariant.barcode,
                  trackLots: product.trackLots,
                  isActive: product.isActive,
                  hasVariants: product.hasVariants,
                }}
                trigger={
                  <Button variant="outline">
                    <Pencil /> Editar
                  </Button>
                }
              />
              <ProductStatusMenu productId={product.id} productName={product.name} isActive={product.isActive} />
            </>
          ) : undefined
        }
      />

      <TabNav
        label="Seções do produto"
        active={tab}
        items={[
          { id: "geral", label: "Visão geral", href: base },
          {
            id: "variacoes",
            label: "Variações",
            href: `${base}?aba=variacoes`,
            count: product.hasVariants ? product.variants.length : undefined,
          },
          { id: "caracteristicas", label: "Características", href: `${base}?aba=caracteristicas` },
          { id: "estoque", label: "Estoque", href: `${base}?aba=estoque` },
        ]}
      />

      {tab === "geral" && <OverviewTab context={context} product={product} />}
      {tab === "variacoes" && <VariantsTab context={context} product={product} />}
      {tab === "caracteristicas" && (
        <CharacteristicsTab context={context} product={product} scope={firstParam(search.escopo)} />
      )}
      {tab === "estoque" && <StockTab context={context} product={product} />}
    </PageContainer>
  );
}
