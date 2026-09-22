import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/data/data-table";
import { FilterBar, FilterSelect, SearchInput } from "@/components/data/filter-controls";
import { StatusBadge } from "@/components/data/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { CreateTenantDialog } from "@/domains/admin/components/create-tenant-dialog";
import { TENANT_STATUS_LABEL } from "@/domains/admin/labels";
import { listAdminTenants, tenantStatusSchema, type AdminTenantRow } from "@/domains/admin/queries";
import { TENANT_SEGMENTS } from "@/domains/tenants/schemas";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { buildHref, firstParam, parsePage } from "@/lib/url";

export const metadata: Metadata = { title: "Empresas · Plataforma" };

export default async function AdminTenantsPage({ searchParams }: PageProps<"/admin/empresas">) {
  const params = await searchParams;
  const search = firstParam(params.q)?.slice(0, 100);
  const statusParsed = tenantStatusSchema.safeParse(firstParam(params.status));
  const status = statusParsed.success ? statusParsed.data : undefined;
  const page = parsePage(params.page);

  const list = await listAdminTenants({ search, status, page });
  const segmentLabel = (value: string) => TENANT_SEGMENTS.find((segment) => segment.value === value)?.label ?? value;

  const columns: DataTableColumn<AdminTenantRow>[] = [
    {
      id: "name",
      header: "Empresa",
      cell: (tenant) => (
        <Link
          href={`/admin/empresas/${tenant.id}`}
          className="flex min-w-0 flex-col rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="truncate font-medium hover:underline">{tenant.name}</span>
          <span className="truncate text-small text-muted-foreground">{segmentLabel(tenant.segment)}</span>
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (tenant) => (
        <StatusBadge tone={TENANT_STATUS_LABEL[tenant.status].tone}>
          {TENANT_STATUS_LABEL[tenant.status].label}
        </StatusBadge>
      ),
    },
    {
      id: "owner",
      header: "Proprietário",
      hideBelow: "md",
      cell: (tenant) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate">{tenant.ownerName || "—"}</span>
          {tenant.ownerEmail && <span className="truncate text-small text-muted-foreground">{tenant.ownerEmail}</span>}
        </div>
      ),
    },
    {
      id: "users",
      header: "Usuários",
      align: "right",
      hideBelow: "sm",
      cell: (tenant) => formatNumber(tenant.activeUsers),
    },
    {
      id: "created",
      header: "Cadastro",
      hideBelow: "lg",
      cell: (tenant) => <span className="text-muted-foreground tabular">{formatDate(tenant.createdAt)}</span>,
    },
    {
      id: "activity",
      header: "Última atividade",
      hideBelow: "lg",
      cell: (tenant) => <span className="text-muted-foreground">{formatRelative(tenant.lastActivityAt)}</span>,
    },
  ];

  return (
    <PageContainer>
      <PageHeader title="Empresas" description="Todas as empresas da plataforma." actions={<CreateTenantDialog />} />
      <DataTable
        caption="Empresas da plataforma"
        columns={columns}
        rows={list.rows}
        getRowKey={(tenant) => tenant.id}
        toolbar={
          <FilterBar>
            <SearchInput placeholder="Buscar por nome ou identificador…" label="Buscar empresas" />
            <FilterSelect
              param="status"
              label="Status"
              allLabel="Todos os status"
              options={Object.entries(TENANT_STATUS_LABEL).map(([value, meta]) => ({ value, label: meta.label }))}
            />
          </FilterBar>
        }
        empty={
          <EmptyState
            className="border-0"
            icon={<Building2 />}
            title={search || status ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada"}
            description={
              search || status ? "Ajuste a busca ou os filtros." : "As empresas aparecem aqui assim que forem criadas."
            }
          />
        }
        pagination={{
          page: list.page,
          pageSize: list.pageSize,
          total: list.total,
          hrefFor: (target) => buildHref("/admin/empresas", params, { page: target > 1 ? target : undefined }),
        }}
      />
    </PageContainer>
  );
}
