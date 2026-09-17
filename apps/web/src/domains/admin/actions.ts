"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";
import { Constants } from "@/types/database.types";
import { requireSuperAdmin } from "./guard";

const setTenantStatusSchema = z.object({
  tenantId: z.uuid(),
  status: z.enum(Constants.public.Enums.tenant_status, { message: "Status inválido." }),
  reason: z.string().trim().min(5, "Descreva o motivo (mín. 5 caracteres).").max(1000, "Motivo muito longo."),
});

export type SetTenantStatusField = keyof z.input<typeof setTenantStatusSchema>;

export async function setTenantStatusAction(
  _prev: ActionState<SetTenantStatusField>,
  formData: FormData,
): Promise<ActionState<SetTenantStatusField>> {
  const admin = await requireSuperAdmin();
  const input = formDataToObject(formData);
  const parsed = setTenantStatusSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_tenant_status", {
    p_tenant_id: parsed.data.tenantId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason,
  });

  if (error) {
    logger.warn({
      event: "admin.tenant_status",
      status: "error",
      user_id: admin.id,
      tenant_id: parsed.data.tenantId,
      code: error.message,
    });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }

  logger.info({
    event: "admin.tenant_status",
    status: "ok",
    user_id: admin.id,
    tenant_id: parsed.data.tenantId,
    new_status: parsed.data.status,
  });
  revalidatePath("/admin", "layout");
  return { status: "success", message: "Status da empresa atualizado." };
}
