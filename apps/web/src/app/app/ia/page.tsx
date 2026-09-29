import type { Metadata } from "next";
import { AccessDenied } from "@/components/feedback/access-denied";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { AiSettingsForm } from "@/domains/ai/components/ai-settings-form";
import { BusinessInfoForm } from "@/domains/ai/components/business-info-form";
import { UsageCard } from "@/domains/ai/components/usage-card";
import { getAiBusinessInfo, getAiSettings, getAiUsageMonthToDate } from "@/domains/ai/queries";
import { getAIProvider } from "@/domains/ai/get-provider";
import { requireTenantContext } from "@/domains/tenants/context";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const [settings, businessInfo, costUsd, { data: limits, error: limitsError }] = await Promise.all([
    getAiSettings(context),
    getAiBusinessInfo(context),
    getAiUsageMonthToDate(context),
    createAdminClient().from("tenant_ai_platform_limits").select("provider").eq("tenant_id", context.tenant.id).maybeSingle(),
  ]);
  if (limitsError) throw new Error("Não foi possível verificar a configuração da IA.");
  const provider = getAIProvider(limits?.provider ?? "anthropic");

  return (
    <PageContainer>
      <PageHeader
        title="Assistente de IA"
        description="Responde automaticamente pelo WhatsApp enquanto a conversa estiver com a IA (veja Atendimento)."
      />
      <UsageCard costUsd={costUsd} isDev={provider.isDev} />
      <AiSettingsForm settings={settings} />
      <BusinessInfoForm info={businessInfo} />
    </PageContainer>
  );
}
