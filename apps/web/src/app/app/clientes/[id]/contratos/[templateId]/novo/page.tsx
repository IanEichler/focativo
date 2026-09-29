import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { AccessDenied } from "@/components/feedback/access-denied";
import { Button } from "@/components/ui/button";
import { GenerateDocumentForm } from "@/domains/documents/components/generate-document-form";
import { getDocumentTemplate } from "@/domains/documents/queries";
import { getCustomerDetail } from "@/domains/customers/queries";
import { listServices } from "@/domains/agenda/queries";
import { listTenantMembers } from "@/domains/users/queries";
import { requireTenantContext } from "@/domains/tenants/context";

export const metadata: Metadata = { title: "Novo contrato" };

export default async function NewCustomerContractPage({ params }: PageProps<"/app/clientes/[id]/contratos/[templateId]/novo">) {
  const context = await requireTenantContext();
  if (!context.can("customers.read") || !context.can("documents.write") || !context.hasModule("documents")) {
    return <PageContainer><PageHeader title="Novo contrato" /><AccessDenied /></PageContainer>;
  }
  const { id, templateId } = await params;
  if (![id, templateId].every(value => /^[0-9a-f-]{36}$/i.test(value))) notFound();
  const [customer, template] = await Promise.all([
    getCustomerDetail(context, id), getDocumentTemplate(context, templateId),
  ]);
  if (!customer || !template) notFound();

  const canSchedule = context.hasModule("agenda") && context.can("agenda.write");
  const [services, members] = canSchedule ? await Promise.all([listServices(context, { activeOnly: true }), listTenantMembers(context)]) : [[], []];
  const scheduling = canSchedule ? { services, professionals: members.filter(item => item.status === "ACTIVE").map(item => ({ userId: item.userId, fullName: item.fullName })) } : undefined;
  return <PageContainer>
    <div><Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
      <Link href={`/app/clientes/${id}?aba=contratos`}><ArrowLeft /> Contratos de {customer.name}</Link>
    </Button></div>
    <PageHeader title={`Novo contrato — ${customer.name}`} description={template.name} />
    <GenerateDocumentForm template={template} scheduling={scheduling} initialCustomer={{
      id: customer.id, name: customer.name, phone: customer.phone, whatsapp: customer.whatsapp,
    }} />
  </PageContainer>;
}
