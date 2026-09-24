import { UserPlus, UserRoundPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/data/data-table";
import { FilterBar, FilterSelect, SearchInput } from "@/components/data/filter-controls";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomerFormSheet } from "@/domains/customers/components/customer-form";
import { originLabel, CUSTOMER_ORIGINS } from "@/domains/customers/labels";
import { CUSTOMER_PAGE_SIZE, listCustomers, type CustomerListItem } from "@/domains/customers/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { initials } from "@/lib/format";
import { buildHref, firstParam, parsePage } from "@/lib/url";

export const metadata: Metadata = { title: "Clientes" };

function ContactCell({ customer }: { customer: CustomerListItem }) {
  const contact = customer.whatsapp ?? customer.phone ?? customer.email;
  return <span className="text-muted-foreground">{contact ?? "—"}</span>;
}

export default async function CustomersPage({ searchParams }: PageProps<"/app/clientes">) {
  const context = await requireTenantContext();
  if (!context.can("customers.read")) {
    return (
      <PageContainer>
        <PageHeader title="Clientes" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const params = await searchParams;
  const query = firstParam(params.q)?.slice(0, 100);
  const origin = firstParam(params.origem);
  const archived = firstParam(params.status) === "arquivados";
  const page = parsePage(params.page);

  const list = await listCustomers(context, { query, origin, archived, page });

  const canWrite = context.can("customers.write");
  const filtered = Boolean(query || origin || archived);

  const columns: DataTableColumn<CustomerListItem>[] = [
    {
      id: "customer",
      header: "Cliente",
      cell: (customer) => (
        <Link
          href={`/app/clientes/${customer.id}`}
          className="group flex min-w-0 items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Avatar>
            <AvatarFallback className="bg-brand-100 text-caption font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
              {initials(customer.name)}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium group-hover:underline">{customer.name}</span>
            {customer.tags.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {customer.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-caption">
                    {tag}
                  </Badge>
                ))}
              </span>
            )}
          </span>
        </Link>
      ),
    },
    { id: "contact", header: "Contato", hideBelow: "sm", cell: (customer) => <ContactCell customer={customer} /> },
    {
      id: "origin",
      header: "Origem",
      hideBelow: "md",
      cell: (customer) => <span className="text-muted-foreground">{originLabel(customer.origin)}</span>,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Clientes"
        description="Cadastro, contato e histórico de cada cliente."
        actions={
          canWrite ? (
            <CustomerFormSheet
              trigger={
                <Button>
                  <UserPlus /> Novo cliente
                </Button>
              }
            />
          ) : undefined
        }
      />

      <DataTable
        caption="Clientes cadastrados"
        columns={columns}
        rows={list.rows}
        getRowKey={(customer) => customer.id}
        toolbar={
          <FilterBar>
            <SearchInput placeholder="Buscar por nome, telefone, e-mail ou CPF…" label="Buscar clientes" />
            <FilterSelect
              param="origem"
              label="Origem"
              allLabel="Todas as origens"
              options={CUSTOMER_ORIGINS.map((item) => ({ value: item.value, label: item.label }))}
            />
            <FilterSelect
              param="status"
              label="Situação"
              allLabel="Ativos"
              options={[{ value: "arquivados", label: "Arquivados" }]}
            />
          </FilterBar>
        }
        empty={
          filtered ? (
            <EmptyState
              className="border-0"
              title="Nenhum cliente encontrado"
              description="Ajuste a busca ou os filtros."
            />
          ) : (
            <EmptyState
              className="border-0"
              icon={<UserRoundPlus />}
              title="Nenhum cliente cadastrado"
              description="Cadastre o primeiro cliente para começar o atendimento e o CRM."
              action={
                canWrite ? (
                  <CustomerFormSheet
                    trigger={
                      <Button>
                        <UserPlus /> Cadastrar cliente
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
          pageSize: CUSTOMER_PAGE_SIZE,
          total: list.total,
          hrefFor: (target) => buildHref("/app/clientes", params, { page: target > 1 ? target : undefined }),
        }}
      />
    </PageContainer>
  );
}
