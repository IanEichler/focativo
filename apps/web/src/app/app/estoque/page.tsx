import { Boxes, CalendarClock, CalendarX2, PackageMinus, PackageX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/data/data-table";
import { FilterBar, FilterSelect, SearchInput } from "@/components/data/filter-controls";
import { MetricCard } from "@/components/data/metric-card";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { resolveTab, TabNav } from "@/components/layout/tab-nav";
import { Badge } from "@/components/ui/badge";
import { ProductThumbnail, StockStatusBadge } from "@/domains/catalog/components/product-visuals";
import { getCatalogOptions } from "@/domains/catalog/queries";
import { LotsTable, MovementsTable } from "@/domains/inventory/components/inventory-tables";
import { StockOperationButtons, StockRowActions } from "@/domains/inventory/components/stock-row-actions";
import { MOVEMENT_TYPE } from "@/domains/inventory/labels";
import { formatQuantity } from "@/lib/format";
import {
  getInventorySummary,
  INVENTORY_FILTERS,
  INVENTORY_PAGE_SIZE,
  listInventory,
  listLots,
  listMovements,
  LOT_FILTERS,
  MOVEMENT_PAGE_SIZE,
  type InventoryFilter,
  type InventoryRow,
  type LotFilter,
} from "@/domains/inventory/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { formatDate, formatNumber } from "@/lib/format";
import { buildHref, firstParam, parsePage } from "@/lib/url";
import type { Enums } from "@/types/database.types";

export const metadata: Metadata = { title: "Estoque" };

const TABS = ["posicao", "lotes", "movimentacoes"] as const;
const MOVEMENT_TYPES = Object.keys(MOVEMENT_TYPE) as Enums<"stock_movement_type">[];

export default async function InventoryPage({ searchParams }: PageProps<"/app/estoque">) {
  const context = await requireTenantContext();
  if (!context.can("inventory.read") || !context.hasModule("inventory")) {
    return (
      <PageContainer>
        <PageHeader title="Estoque" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const params = await searchParams;
  const canHistory = context.can("inventory.history");
  const tab = resolveTab(firstParam(params.aba), canHistory ? TABS : (["posicao", "lotes"] as const), "posicao");
  const page = parsePage(params.page);
  const query = firstParam(params.q)?.slice(0, 100);
  const permissions = {
    entry: context.can("inventory.entry"),
    adjust: context.can("inventory.adjust"),
    costs: context.can("catalog.costs"),
  };

  const [summary, options] = await Promise.all([
    getInventorySummary(context),
    permissions.entry ? getCatalogOptions(context) : Promise.resolve(null),
  ]);
  const suppliers = (options?.suppliers ?? []).filter((supplier) => supplier.isActive);
  const tabHref = (id: string, extra: Record<string, string | undefined> = {}) =>
    buildHref("/app/estoque", {}, { aba: id === "posicao" ? undefined : id, ...extra });

  return (
    <PageContainer>
      <PageHeader
        title="Estoque"
        description="Disponibilidade, lotes, validade e histórico de movimentações."
        actions={<StockOperationButtons permissions={permissions} suppliers={suppliers} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Link
          href={tabHref("posicao")}
          className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <MetricCard label="Itens ativos" value={formatNumber(summary.activeVariants)} icon={<Boxes />} />
        </Link>
        <Link
          href={tabHref("posicao", { status: "LOW" })}
          className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <MetricCard label="Estoque baixo" value={formatNumber(summary.lowStock)} icon={<PackageMinus />} />
        </Link>
        <Link
          href={tabHref("posicao", { status: "OUT" })}
          className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <MetricCard label="Sem estoque" value={formatNumber(summary.outOfStock)} icon={<PackageX />} />
        </Link>
        <Link
          href={tabHref("lotes", { status: "EXPIRING" })}
          className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <MetricCard
            label="Lotes vencendo"
            value={formatNumber(summary.expiringLots)}
            icon={<CalendarClock />}
            hint={`próximos ${summary.expiryAlertDays} dias`}
          />
        </Link>
        <Link
          href={tabHref("lotes", { status: "EXPIRED" })}
          className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <MetricCard
            label="Lotes vencidos"
            value={formatNumber(summary.expiredLots)}
            icon={<CalendarX2 />}
            hint="com saldo"
          />
        </Link>
      </div>

      <TabNav
        label="Seções do estoque"
        active={tab}
        items={[
          { id: "posicao", label: "Posição", href: tabHref("posicao") },
          { id: "lotes", label: "Lotes", href: tabHref("lotes") },
          ...(canHistory ? [{ id: "movimentacoes", label: "Movimentações", href: tabHref("movimentacoes") }] : []),
        ]}
      />

      {tab === "posicao" && (
        <PositionTab
          context={context}
          params={params}
          page={page}
          query={query}
          permissions={permissions}
          suppliers={suppliers}
        />
      )}
      {tab === "lotes" && <LotsTab context={context} params={params} page={page} query={query} />}
      {tab === "movimentacoes" && canHistory && (
        <MovementsTab context={context} params={params} page={page} showCosts={permissions.costs} />
      )}
    </PageContainer>
  );
}

type TabProps = {
  context: Awaited<ReturnType<typeof requireTenantContext>>;
  params: Record<string, string | string[] | undefined>;
  page: number;
};

async function PositionTab({
  context,
  params,
  page,
  query,
  permissions,
  suppliers,
}: TabProps & {
  query?: string;
  permissions: { entry: boolean; adjust: boolean; costs: boolean };
  suppliers: { id: string; name: string }[];
}) {
  const status = firstParam(params.status);
  const filter = (INVENTORY_FILTERS as readonly string[]).includes(status ?? "")
    ? (status as InventoryFilter)
    : undefined;
  const list = await listInventory(context, { query, filter, page });

  const columns: DataTableColumn<InventoryRow>[] = [
    {
      id: "product",
      header: "Produto",
      cell: (row) => (
        <Link
          href={`/app/produtos/${row.productId}?aba=estoque`}
          className="group flex min-w-0 items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ProductThumbnail path={row.imagePath} name={row.productName} size={36} />
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2">
              <span className="truncate font-medium group-hover:underline">
                {row.hasVariants ? `${row.productName} — ${row.variantName}` : row.productName}
              </span>
              {!row.isActive && <Badge variant="outline">Inativo</Badge>}
            </span>
            <span className="truncate text-small text-muted-foreground">
              {row.sku ?? "Sem SKU"}
              {row.categoryName ? ` · ${row.categoryName}` : ""}
            </span>
          </span>
        </Link>
      ),
    },
    {
      id: "physical",
      header: "Físico",
      align: "right",
      hideBelow: "md",
      cell: (row) => formatQuantity(row.physical, row.unit),
    },
    {
      id: "reserved",
      header: "Reservado",
      align: "right",
      hideBelow: "lg",
      cell: (row) => formatQuantity(row.reserved, row.unit),
    },
    {
      id: "available",
      header: "Disponível",
      align: "right",
      cell: (row) => <span className="font-medium">{formatQuantity(row.available, row.unit)}</span>,
    },
    {
      id: "min",
      header: "Mínimo",
      align: "right",
      hideBelow: "lg",
      cell: (row) => formatQuantity(row.minStock, row.unit),
    },
    {
      id: "expiry",
      header: "Próx. validade",
      hideBelow: "md",
      cell: (row) =>
        row.trackLots ? (
          <span className="flex flex-col text-small">
            <span className="tabular">{formatDate(row.nextExpiration)}</span>
            {row.expiredQuantity > 0 && (
              <span className="text-danger">{formatQuantity(row.expiredQuantity, row.unit)} vencido</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { id: "status", header: "Situação", hideBelow: "sm", cell: (row) => <StockStatusBadge status={row.stockStatus} /> },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      align: "right",
      className: "w-12",
      cell: (row) => (
        <StockRowActions
          permissions={permissions}
          suppliers={suppliers}
          variant={{
            variantId: row.variantId,
            productId: row.productId,
            label: row.hasVariants ? `${row.productName} — ${row.variantName}` : row.productName,
            sku: row.sku,
            unit: row.unit,
            trackLots: row.trackLots,
            physical: row.physical,
            available: row.available,
          }}
        />
      ),
    },
  ];

  return (
    <DataTable
      caption="Posição de estoque"
      columns={columns}
      rows={list.rows}
      getRowKey={(row) => row.variantId}
      toolbar={
        <FilterBar>
          <SearchInput placeholder="Buscar por produto, SKU ou código…" label="Buscar no estoque" />
          <FilterSelect
            param="status"
            label="Situação"
            allLabel="Todos os itens"
            options={[
              { value: "LOW", label: "Estoque baixo" },
              { value: "OUT", label: "Sem estoque" },
              { value: "EXPIRING", label: "Com lote vencendo" },
              { value: "EXPIRED", label: "Com lote vencido" },
            ]}
          />
        </FilterBar>
      }
      empty={
        <EmptyState
          className="border-0"
          icon={<Boxes />}
          title={query || filter ? "Nenhum item encontrado" : "Nenhum produto no estoque"}
          description={query || filter ? "Ajuste a busca ou o filtro." : "Cadastre produtos para acompanhar o estoque."}
        />
      }
      pagination={{
        page,
        pageSize: INVENTORY_PAGE_SIZE,
        total: list.total,
        hrefFor: (target) => buildHref("/app/estoque", params, { page: target > 1 ? target : undefined }),
      }}
    />
  );
}

async function LotsTab({ context, params, page, query }: TabProps & { query?: string }) {
  const status = firstParam(params.status);
  const filter = (LOT_FILTERS as readonly string[]).includes(status ?? "") ? (status as LotFilter) : undefined;
  const list = await listLots(context, { filter, query, page });

  return (
    <LotsTable
      rows={list.rows}
      toolbar={
        <FilterBar>
          <SearchInput placeholder="Buscar por lote, produto ou SKU…" label="Buscar lotes" />
          <FilterSelect
            param="status"
            label="Situação do lote"
            allLabel="Com saldo"
            options={[
              { value: "EXPIRING", label: "Vencendo" },
              { value: "EXPIRED", label: "Vencidos com saldo" },
              { value: "ALL", label: "Todos (inclui esgotados)" },
            ]}
          />
        </FilterBar>
      }
      empty={
        <EmptyState
          className="border-0"
          title="Nenhum lote encontrado"
          description="Lotes são criados nas entradas de produtos com controle de validade."
        />
      }
      pagination={{
        page,
        pageSize: INVENTORY_PAGE_SIZE,
        total: list.total,
        hrefFor: (target) => buildHref("/app/estoque", params, { page: target > 1 ? target : undefined }),
      }}
    />
  );
}

async function MovementsTab({ context, params, page, showCosts }: TabProps & { showCosts: boolean }) {
  const type = firstParam(params.tipo);
  const productParam = firstParam(params.produto);
  const list = await listMovements(context, {
    type: (MOVEMENT_TYPES as string[]).includes(type ?? "") ? (type as Enums<"stock_movement_type">) : undefined,
    productId: productParam && /^[0-9a-f-]{36}$/i.test(productParam) ? productParam : undefined,
    page,
  });

  return (
    <MovementsTable
      rows={list.rows}
      showCosts={showCosts}
      toolbar={
        <FilterBar>
          <FilterSelect
            param="tipo"
            label="Tipo de movimentação"
            allLabel="Todos os tipos"
            options={MOVEMENT_TYPES.map((value) => ({ value, label: MOVEMENT_TYPE[value].label }))}
          />
          {productParam && (
            <Link href="/app/estoque?aba=movimentacoes" className="text-small font-medium text-primary hover:underline">
              Limpar filtro de produto
            </Link>
          )}
        </FilterBar>
      }
      empty={
        <EmptyState
          className="border-0"
          title="Nenhuma movimentação"
          description="Entradas, ajustes, perdas, reservas e vendas aparecem aqui."
        />
      }
      pagination={{
        page,
        pageSize: MOVEMENT_PAGE_SIZE,
        total: list.total,
        hrefFor: (target) => buildHref("/app/estoque", params, { page: target > 1 ? target : undefined }),
      }}
    />
  );
}
