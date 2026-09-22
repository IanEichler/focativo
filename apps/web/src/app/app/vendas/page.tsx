import { Receipt, ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/data/data-table";
import { FilterBar, FilterSelect } from "@/components/data/filter-controls";
import { MoneyValue } from "@/components/data/money-value";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SaleFormSheet } from "@/domains/sales/components/sale-form";
import { paymentMethodLabel, saleOriginLabel } from "@/domains/sales/labels";
import { listSales, SALE_PAGE_SIZE, type SaleListItem } from "@/domains/sales/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { formatDateTime } from "@/lib/format";
import { buildHref, firstParam, parsePage } from "@/lib/url";

export const metadata: Metadata = { title: "Vendas" };

export default async function SalesPage({ searchParams }: PageProps<"/app/vendas">) {
  const context = await requireTenantContext();
  if (!context.can("sales.read") || !context.hasModule("sales")) {
    return (
      <PageContainer>
        <PageHeader title="Vendas" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const params = await searchParams;
  const canceled = firstParam(params.status) === "canceladas";
  const page = parsePage(params.page);
  const list = await listSales(context, { canceled, page });
  const canWrite = context.can("sales.write");
  const canDiscount = context.can("sales.discount");

  const columns: DataTableColumn<SaleListItem>[] = [
    {
      id: "sale",
      header: "Venda",
      cell: (sale) => (
        <Link
          href={`/app/vendas/${sale.id}`}
          className="flex flex-col rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="font-medium hover:underline">{sale.customerName ?? "Cliente não identificado"}</span>
          <span className="text-small text-muted-foreground">{formatDateTime(sale.createdAt)}</span>
        </Link>
      ),
    },
    {
      id: "origin",
      header: "Origem",
      hideBelow: "md",
      cell: (sale) => <span className="text-muted-foreground">{saleOriginLabel(sale.origin)}</span>,
    },
    {
      id: "payment",
      header: "Pagamento",
      hideBelow: "lg",
      cell: (sale) => <span className="text-muted-foreground">{paymentMethodLabel(sale.paymentMethod)}</span>,
    },
    {
      id: "status",
      header: "Situação",
      hideBelow: "sm",
      cell: (sale) =>
        sale.canceledAt ? <Badge variant="destructive">Cancelada</Badge> : <Badge variant="outline">Concluída</Badge>,
    },
    { id: "total", header: "Total", align: "right", cell: (sale) => <MoneyValue value={sale.total} /> },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Vendas"
        description="Histórico de vendas do PDV."
        actions={
          canWrite ? (
            <SaleFormSheet
              canDiscount={canDiscount}
              trigger={
                <Button>
                  <ShoppingCart /> Nova venda
                </Button>
              }
            />
          ) : undefined
        }
      />

      <DataTable
        caption="Vendas registradas"
        columns={columns}
        rows={list.rows}
        getRowKey={(sale) => sale.id}
        toolbar={
          <FilterBar>
            <FilterSelect
              param="status"
              label="Situação"
              allLabel="Concluídas"
              options={[{ value: "canceladas", label: "Canceladas" }]}
            />
          </FilterBar>
        }
        empty={
          <EmptyState
            className="border-0"
            icon={<Receipt />}
            title="Nenhuma venda registrada"
            description="Registre a primeira venda pelo PDV."
            action={
              canWrite ? (
                <SaleFormSheet
                  canDiscount={canDiscount}
                  trigger={
                    <Button>
                      <ShoppingCart /> Nova venda
                    </Button>
                  }
                />
              ) : undefined
            }
          />
        }
        pagination={{
          page,
          pageSize: SALE_PAGE_SIZE,
          total: list.total,
          hrefFor: (target) => buildHref("/app/vendas", params, { page: target > 1 ? target : undefined }),
        }}
      />
    </PageContainer>
  );
}
