import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { AccessDenied } from "@/components/feedback/access-denied";
import { GenerateDocumentForm } from "@/domains/documents/components/generate-document-form";
import { getDocumentTemplate } from "@/domains/documents/queries";
import { getCustomerDetail } from "@/domains/customers/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { firstParam } from "@/lib/url";

export const metadata: Metadata = { title: "Gerar documento" };

export default async function GerarDocumentoPage({
  params,
  searchParams,
}: PageProps<"/app/documentos/[templateId]/gerar">) {
  const context = await requireTenantContext();
  if (!context.can("documents.write") || !context.hasModule("documents")) {
    return (
      <PageContainer>
        <PageHeader title="Gerar documento" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const { templateId } = await params;
  const template = await getDocumentTemplate(context, templateId);
  if (!template) notFound();

  const search = await searchParams;
  const preselectedCustomerId = firstParam(search.clienteId);
  const preselectedCustomer = preselectedCustomerId ? await getCustomerDetail(context, preselectedCustomerId) : null;

  return (
    <PageContainer>
      <PageHeader
        title={`Gerar documento — ${template.name}`}
        description="Escolha o cliente e confira os dados antes de baixar."
      />
      <GenerateDocumentForm
        template={template}
        initialCustomer={
          preselectedCustomer
            ? {
                id: preselectedCustomer.id,
                name: preselectedCustomer.name,
                phone: preselectedCustomer.phone,
                whatsapp: preselectedCustomer.whatsapp,
              }
            : null
        }
      />
    </PageContainer>
  );
}
