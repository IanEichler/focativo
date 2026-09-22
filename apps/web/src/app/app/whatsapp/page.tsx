import type { Metadata } from "next";
import { AccessDenied } from "@/components/feedback/access-denied";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ConnectionCard } from "@/domains/whatsapp/components/connection-card";
import { SimulateIncomingForm } from "@/domains/whatsapp/components/simulate-incoming-form";
import { getWhatsAppProvider } from "@/domains/whatsapp/get-provider";
import { getWhatsAppAccount } from "@/domains/whatsapp/queries";
import { requireTenantContext } from "@/domains/tenants/context";

export const metadata: Metadata = { title: "WhatsApp" };

export default async function WhatsAppSettingsPage() {
  const context = await requireTenantContext();
  if (!context.can("tenant.update") || !context.hasModule("whatsapp")) {
    return (
      <PageContainer>
        <PageHeader title="WhatsApp" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const provider = getWhatsAppProvider();
  const account = await getWhatsAppAccount(context);

  return (
    <PageContainer>
      <PageHeader
        title="WhatsApp"
        description="Conecte o número que a IA e a equipe usarão para atender pelo WhatsApp."
      />
      <ConnectionCard account={account} isDev={provider.isDev} />
      {provider.isDev && <SimulateIncomingForm />}
    </PageContainer>
  );
}
