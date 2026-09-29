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

  return <PageContainer>
    <div><Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
      <Link href={`/app/clientes/${id}?aba=contratos`}><ArrowLeft /> Contratos de {customer.name}</Link>
    </Button></div>
    <PageHeader title={`Novo contrato — ${customer.name}`} description={template.name} />
    <GenerateDocumentForm template={template} initialCustomer={{
      id: customer.id, name: customer.name, phone: customer.phone, whatsapp: customer.whatsapp,
    }} />
  </PageContainer>;
}
