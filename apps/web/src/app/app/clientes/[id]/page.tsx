import { ArrowLeft, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { resolveTab, TabNav } from "@/components/layout/tab-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArchiveCustomerButton } from "@/domains/customers/components/archive-customer-button";
import { CustomerFormSheet } from "@/domains/customers/components/customer-form";
import { DeleteCustomerDialog } from "@/domains/customers/components/delete-customer-dialog";
import { originLabel } from "@/domains/customers/labels";
import { getCustomerDetail, listCustomerTimeline } from "@/domains/customers/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { signingClient } from "@/domains/signatures/client";
import { firstParam } from "@/lib/url";
import { DocumentsTab } from "./documents-tab";
import { FinancialTab } from "./financial-tab";
import { OverviewTab } from "./overview-tab";
import { HistoryTab } from "./history-tab";

export const metadata: Metadata = { title: "Cliente" };

const TABS = ["geral", "historico", "contratos", "financeiro", "documentos"] as const;

export default async function CustomerDetailPage({ params, searchParams }: PageProps<"/app/clientes/[id]">) {
  const context = await requireTenantContext();
  const { id } = await params;
  if (!context.can("customers.read") || !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const search = await searchParams;
  // "compras" era o nome antigo desta aba: links salvos abrem o Histórico.
  const requestedTab = firstParam(search.aba);
  const tab = resolveTab(requestedTab === "compras" ? "historico" : requestedTab, TABS, "geral");
  const customer = await getCustomerDetail(context, id);
  if (!customer) notFound();

  const canWrite = context.can("customers.write");
  const signed = canWrite
    ? await signingClient()
        .from("contract_signatures")
        .select("id")
        .eq("tenant_id", context.tenant.id)
        .eq("customer_id", id)
        .eq("status", "SIGNED")
        .limit(1)
    : null;
  const canDelete = canWrite && signed && !signed.error && signed.data?.length === 0;
  const timeline = tab === "geral" ? await listCustomerTimeline(context, id) : [];

  const base = `/app/clientes/${customer.id}`;
  const showFinancial = context.hasModule("financial") && context.can("financial.read");

  return (
    <PageContainer>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
          <Link href="/app/clientes">
            <ArrowLeft /> Clientes
          </Link>
        </Button>
      </div>

      <PageHeader
        title={customer.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{customer.whatsapp ?? customer.phone ?? customer.email ?? "Sem contato"}</span>
            <span>· {originLabel(customer.origin)}</span>
            {customer.archivedAt && <Badge variant="outline">Arquivado</Badge>}
          </span>
        }
        actions={
          canWrite ? (
            <>
              <CustomerFormSheet
                customer={{
                  id: customer.id,
                  name: customer.name,
                  phone: customer.phone,
                  whatsapp: customer.whatsapp,
                  email: customer.email,
                  document: customer.document,
                  birthday: customer.birthday,
                  rg: customer.rg,
                  profession: customer.profession,
                  address: customer.address,
                  city_state: customer.city_state,
                  postal_code: customer.postal_code,
                  notes: customer.notes,
                  tags: customer.tags,
                  origin: customer.origin,
                }}
                trigger={
                  <Button variant="outline">
                    <Pencil /> Editar
                  </Button>
                }
              />
              <ArchiveCustomerButton customerId={customer.id} archived={Boolean(customer.archivedAt)} />
              {canDelete && <DeleteCustomerDialog customerId={customer.id} customerName={customer.name} />}
            </>
          ) : undefined
        }
      />

      <TabNav
        label="Seções do cliente"
        active={tab === "documentos" ? "contratos" : tab}
        items={[
          { id: "geral", label: "Visão geral", href: base },
          { id: "historico", label: "Histórico", href: `${base}?aba=historico` },
          { id: "contratos", label: "Contratos", href: `${base}?aba=contratos` },
          ...(showFinancial ? [{ id: "financeiro", label: "Financeiro", href: `${base}?aba=financeiro` }] : []),
        ]}
      />

      {tab === "geral" && <OverviewTab customer={customer} timeline={timeline.slice(0, 5)} />}
      {tab === "historico" && <HistoryTab context={context} customerId={customer.id} />}
      {(tab === "contratos" || tab === "documentos") && <DocumentsTab context={context} customerId={customer.id} />}
      {tab === "financeiro" && <FinancialTab context={context} customerId={customer.id} />}
    </PageContainer>
  );
}
