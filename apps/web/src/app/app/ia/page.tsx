import type { Metadata } from "next";
import { AccessDenied } from "@/components/feedback/access-denied";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { AiSettingsForm } from "@/domains/ai/components/ai-settings-form";
import { UsageCard } from "@/domains/ai/components/usage-card";
import { getAiSettings, getAiUsageMonthToDate } from "@/domains/ai/queries";
import { getAIProvider } from "@/domains/ai/get-provider";
import { requireTenantContext } from "@/domains/tenants/context";

export const metadata: Metadata = { title: "Assistente de IA" };

export default async function AiSettingsPage() {
  const context = await requireTenantContext();
  if (!context.can("tenant.update") || !context.hasModule("ai")) {
    return (
      <PageContainer>
        <PageHeader title="Assistente de IA" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const [settings, costUsd] = await Promise.all([getAiSettings(context), getAiUsageMonthToDate(context)]);
  const provider = getAIProvider();

  return (
    <PageContainer>
      <PageHeader
        title="Assistente de IA"
        description="Responde automaticamente pelo WhatsApp enquanto a conversa estiver com a IA (veja Atendimento)."
      />
      <UsageCard costUsd={costUsd} isDev={provider.isDev} />
      <AiSettingsForm settings={settings} />
    </PageContainer>
  );
}
