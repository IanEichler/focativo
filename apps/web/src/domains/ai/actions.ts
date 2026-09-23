"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/domains/tenants/context";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, validationError } from "@/lib/validation";
import { aiSettingsSchema, type AiSettingsField } from "./schemas";

export async function saveAiSettingsAction(
  _prev: ActionState<AiSettingsField>,
  formData: FormData,
): Promise<ActionState<AiSettingsField>> {
  const context = await requireTenantContext();
  if (!context.can("tenant.update")) return { status: "error", message: toUserMessage({ message: "forbidden" }) };

  const input = formDataToObject(formData);
  const parsed = aiSettingsSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const { enabled, systemPrompt } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("ai_settings_update", {
    p_tenant_id: context.tenant.id,
    p_enabled: enabled,
    p_system_prompt: systemPrompt,
  });
  if (error) return { status: "error", message: toUserMessage(error) };

  revalidatePath("/app/ia");
  return { status: "success", message: "Configurações da IA salvas." };
}
