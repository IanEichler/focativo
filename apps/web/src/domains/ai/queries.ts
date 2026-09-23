import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";

export interface AiSettings {
  enabled: boolean;
  systemPrompt: string | null;
}

/** Modelo, limite de tokens e orçamento são só do admin master agora — ver domains/admin/ai. */
export async function getAiSettings(context: TenantContext): Promise<AiSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ai_settings_get", { p_tenant_id: context.tenant.id });
  if (error) throw new Error(`ai_settings_get failed: ${error.code}`);
  const row = data?.[0];
  if (!row) throw new Error("ai_settings_get failed: empty response");
  return {
    enabled: row.enabled,
    systemPrompt: row.system_prompt,
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface AiBusinessInfo {
  businessDescription: string | null;
  generalPolicies: string | null;
  faq: FaqItem[];
  screeningFlow: string[];
}

export async function getAiBusinessInfo(context: TenantContext): Promise<AiBusinessInfo> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ai_business_info_get", { p_tenant_id: context.tenant.id });
  if (error) throw new Error(`ai_business_info_get failed: ${error.code}`);
  const row = data?.[0];
  if (!row) throw new Error("ai_business_info_get failed: empty response");
  return {
    businessDescription: row.business_description,
    generalPolicies: row.general_policies,
    faq: (row.faq as unknown as FaqItem[]) ?? [],
    screeningFlow: (row.screening_flow as unknown as string[]) ?? [],
  };
}

export async function getAiUsageMonthToDate(context: TenantContext): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ai_usage_month_to_date", { p_tenant_id: context.tenant.id });
  if (error) throw new Error(`ai_usage_month_to_date failed: ${error.code}`);
  return Number(data ?? 0);
}
