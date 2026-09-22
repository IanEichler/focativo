import { ArrowLeft, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { resolveTab, TabNav } from "@/components/layout/tab-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomerFormSheet } from "@/domains/customers/components/customer-form";
import { originLabel } from "@/domains/customers/labels";
import { getCustomerDetail, listCustomerTimeline } from "@/domains/customers/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { listTenantMembers } from "@/domains/users/queries";
import { firstParam } from "@/lib/url";
import { OpportunitiesTab } from "./opportunities-tab";
import { OverviewTab } from "./overview-tab";
import { PurchasesTab } from "./purchases-tab";
import { TimelineTab } from "./timeline-tab";

export const metadata: Metadata = { title: "Cliente" };

const TABS = ["geral", "timeline", "oportunidades", "compras"] as const;

export default async function CustomerDetailPage({ params, searchParams }: PageProps<"/app/clientes/[id]">) {
  const context = await requireTenantContext();
  const { id } = await params;
  if (!context.can("customers.read") || !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const search = await searchParams;
  const tab = resolveTab(firstParam(search.aba), TABS, "geral");
  const customer = await getCustomerDetail(context, id);
  if (!customer) notFound();

  const canWrite = context.can("customers.write");
  const [members, timeline] = await Promise.all([
    canWrite ? listTenantMembers(context) : Promise.resolve([]),
    tab === "timeline" || tab === "geral" ? listCustomerTimeline(context, id) : Promise.resolve([]),
  ]);
  const responsibles = members
    .filter((m) => m.status === "ACTIVE")
    .map((m) => ({ userId: m.userId, fullName: m.fullName }));

  const base = `/app/clientes/${customer.id}`;

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
            <CustomerFormSheet
              responsibles={responsibles}
              customer={{
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                whatsapp: customer.whatsapp,
                email: customer.email,
                document: customer.document,
                birthday: customer.birthday,
                notes: customer.notes,
                tags: customer.tags,
                origin: customer.origin,
                responsibleUserId: customer.responsibleUserId,
              }}
              trigger={
                <Button variant="outline">
                  <Pencil /> Editar
                </Button>
              }
            />
          ) : undefined
        }
      />

      <TabNav
        label="Seções do cliente"
        active={tab}
        items={[
          { id: "geral", label: "Visão geral", href: base },
          { id: "timeline", label: "Timeline", href: `${base}?aba=timeline` },
          { id: "oportunidades", label: "Oportunidades", href: `${base}?aba=oportunidades` },
          { id: "compras", label: "Compras", href: `${base}?aba=compras` },
        ]}
      />

      {tab === "geral" && <OverviewTab customer={customer} timeline={timeline.slice(0, 5)} />}
      {tab === "timeline" && <TimelineTab timeline={timeline} />}
      {tab === "oportunidades" && (
        <OpportunitiesTab context={context} customer={customer} responsibles={responsibles} />
      )}
      {tab === "compras" && <PurchasesTab context={context} customerId={customer.id} />}
    </PageContainer>
  );
}
