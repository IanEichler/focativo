import { PackagePlus, Plus, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/data/data-table";
import { FilterBar, FilterSelect, SearchInput } from "@/components/data/filter-controls";
import { MoneyValue } from "@/components/data/money-value";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductFormSheet } from "@/domains/catalog/components/product-form";
import { ProductThumbnail, StockStatusBadge } from "@/domains/catalog/components/product-visuals";
import {
  getCatalogOptions,
  PRODUCT_PAGE_SIZE,
  PRODUCT_SORTS,
  searchProducts,
  type ProductListItem,
  type ProductSort,
} from "@/domains/catalog/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { formatQuantity } from "@/lib/format";
import { buildHref, firstParam, parsePage } from "@/lib/url";

export const metadata: Metadata = { title: "Produtos" };

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "recent", label: "Atualizados recentemente" },
  { value: "price_asc", label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
  { value: "stock", label: "Menor disponibilidade" },
];

function PriceCell({ product }: { product: ProductListItem }) {
  if (product.hasVariants && product.minPrice !== null && product.maxPrice !== null && product.minPrice !== product.maxPrice) {
    return (
      <span>
        <MoneyValue value={product.minPrice} /> – <MoneyValue value={product.maxPrice} />
      </span>
    );
  }
  if (product.promoPrice !== null && product.salePrice !== null) {
    return (
      <span className="flex flex-col items-end">
        <MoneyValue value={product.promoPrice} className="font-medium text-success" />
        <MoneyValue value={product.salePrice} className="text-caption text-muted-foreground line-through" />
      </span>
    );
  }
  return product.minPrice !== null ? <MoneyValue value={product.minPrice} /> : <span>—</span>;
}

export default async function ProductsPage({ searchParams }: PageProps<"/app/produtos">) {
  const context = await requireTenantContext();
  if (!context.can("catalog.read")) {
    return (
      <PageContainer>
        <PageHeader title="Produtos" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const params = await searchParams;
  const query = firstParam(params.q)?.slice(0, 100);
  const status = firstParam(params.status);
  const stock = firstParam(params.estoque);
  const sort = firstParam(params.ordem);
  const category = firstParam(params.categoria);
  const brand = firstParam(params.marca);
  const page = parsePage(params.page);
  const uuid = /^[0-9a-f-]{36}$/i;

  const [options, list] = await Promise.all([
    getCatalogOptions(context),
    searchProducts(context, {
      query,
      status: status === "inactive" || status === "all" ? status : "active",
      stockStatus: stock === "LOW" || stock === "OUT" ? stock : undefined,
      sort: (PRODUCT_SORTS as readonly string[]).includes(sort ?? "") ? (sort as ProductSort) : "name",
      categoryId: category && uuid.test(category) ? category : undefined,
      brandId: brand && uuid.test(brand) ? brand : undefined,
      page,
    }),
  ]);

  const canWrite = context.can("catalog.write");
  const filtered = Boolean(query || status || stock || category || brand);

  const columns: DataTableColumn<ProductListItem>[] = [
    {
      id: "product",
      header: "Produto",
      cell: (product) => (
        <Link
          href={`/app/produtos/${product.id}`}
          className="group flex min-w-0 items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ProductThumbnail path={product.imagePath} name={product.name} />
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2">
              <span className="truncate font-medium group-hover:underline">{product.name}</span>
              {!product.isActive && <Badge variant="outline">Inativo</Badge>}
            </span>
            <span className="truncate text-small text-muted-foreground">
              {product.hasVariants ? `${product.variantCount} variações` : (product.sku ?? "Sem SKU")}
              {product.brandName ? ` · ${product.brandName}` : ""}
            </span>
          </span>
        </Link>
      ),
    },
    {
      id: "category",
      header: "Categoria",
      hideBelow: "lg",
      cell: (product) => <span className="text-muted-foreground">{product.categoryName ?? "—"}</span>,
    },
    { id: "price", header: "Preço", align: "right", cell: (product) => <PriceCell product={product} /> },
    {
      id: "available",
      header: "Disponível",
      align: "right",
      hideBelow: "sm",
      cell: (product) => formatQuantity(product.availableQuantity, product.unit),
    },
    {
      id: "stock",
      header: "Estoque",
      hideBelow: "md",
      cell: (product) => <StockStatusBadge status={product.stockStatus} />,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Produtos"
        description="Gerencie catálogo, preços, características e disponibilidade."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/app/produtos/cadastros">
                <Settings2 /> Cadastros
              </Link>
            </Button>
            {canWrite && (
              <ProductFormSheet
                options={options}
                canEditCost={context.can("catalog.costs")}
                trigger={
                  <Button>
                    <Plus /> Novo produto
                  </Button>
                }
              />
            )}
          </>
        }
      />

      <DataTable
        caption="Produtos do catálogo"
        columns={columns}
        rows={list.rows}
        getRowKey={(product) => product.id}
        toolbar={
          <FilterBar>
            <SearchInput placeholder="Buscar por nome, marca, SKU ou código…" label="Buscar produtos" />
            <FilterSelect
              param="categoria"
              label="Categoria"
              allLabel="Todas as categorias"
              options={options.categories.map((item) => ({ value: item.id, label: item.path }))}
            />
            <FilterSelect
              param="marca"
              label="Marca"
              allLabel="Todas as marcas"
              options={options.brands.map((item) => ({ value: item.id, label: item.name }))}
            />
            <FilterSelect
              param="estoque"
              label="Estoque"
              allLabel="Qualquer estoque"
              options={[
                { value: "LOW", label: "Estoque baixo" },
                { value: "OUT", label: "Sem estoque" },
              ]}
            />
            <FilterSelect
              param="status"
              label="Situação"
              allLabel="Ativos"
              options={[
                { value: "inactive", label: "Inativos" },
                { value: "all", label: "Ativos e inativos" },
              ]}
            />
            <FilterSelect param="ordem" label="Ordenação" allLabel="Nome (A–Z)" options={SORT_OPTIONS} />
          </FilterBar>
        }
        empty={
          filtered ? (
            <EmptyState
              className="border-0"
              title="Nenhum produto encontrado"
              description="Ajuste a busca ou os filtros."
            />
          ) : (
            <EmptyState
              className="border-0"
              icon={<PackagePlus />}
              title="Seu catálogo está vazio"
              description="Cadastre o primeiro produto com preço, características e estoque."
              action={
                canWrite ? (
                  <ProductFormSheet
                    options={options}
                    canEditCost={context.can("catalog.costs")}
                    trigger={
                      <Button>
                        <Plus /> Cadastrar produto
                      </Button>
                    }
                  />
                ) : undefined
              }
            />
          )
        }
        pagination={{
          page,
          pageSize: PRODUCT_PAGE_SIZE,
          total: list.total,
          hrefFor: (target) => buildHref("/app/produtos", params, { page: target > 1 ? target : undefined }),
        }}
      />
    </PageContainer>
  );
}
