"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/domains/auth/session";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";
import { ACTIVE_TENANT_COOKIE, ACTIVE_TENANT_COOKIE_OPTIONS, requireTenantContext } from "./context";
import {
  createTenantSchema,
  tenantIdSchema,
  updateTenantSchema,
  type CreateTenantField,
  type UpdateTenantField,
} from "./schemas";

export async function createTenantAction(
  _prev: ActionState<CreateTenantField>,
  formData: FormData,
): Promise<ActionState<CreateTenantField>> {
  const user = await requireUser();
  const input = formDataToObject(formData);
  const parsed = createTenantSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const supabase = await createClient();
  const { data: tenantId, error } = await supabase.rpc("create_tenant", {
    p_name: parsed.data.name,
    p_segment: parsed.data.segment,
  });

  if (error || !tenantId) {
    logger.error({ event: "tenant.create", status: "error", user_id: user.id, code: error?.message });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }

  logger.info({ event: "tenant.create", status: "ok", user_id: user.id, tenant_id: tenantId });
  (await cookies()).set(ACTIVE_TENANT_COOKIE, tenantId, ACTIVE_TENANT_COOKIE_OPTIONS);
  redirect(ROUTES.appHome);
}

/** Troca a empresa ativa. O cookie só é gravado se houver associação ativa (RLS). */
export async function switchTenantAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = tenantIdSchema.safeParse(formData.get("tenantId"));
  if (!parsed.success) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("tenant_id", parsed.data)
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!data) {
    logger.warn({ event: "tenant.switch", status: "denied", user_id: user.id, tenant_id: parsed.data });
    return;
  }

  (await cookies()).set(ACTIVE_TENANT_COOKIE, parsed.data, ACTIVE_TENANT_COOKIE_OPTIONS);
  revalidatePath("/app", "layout");
  redirect(ROUTES.appHome);
}

export async function updateTenantAction(
  _prev: ActionState<UpdateTenantField>,
  formData: FormData,
): Promise<ActionState<UpdateTenantField>> {
  const context = await requireTenantContext();
  if (!context.can("tenant.update")) {
    return { status: "error", message: toUserMessage({ message: "forbidden" }) };
  }

  const input = formDataToObject(formData);
  const parsed = updateTenantSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .update({
      name: parsed.data.name,
      legal_name: parsed.data.legalName,
      document: parsed.data.document,
      email: parsed.data.email,
      phone: parsed.data.phone,
      segment: parsed.data.segment,
      timezone: parsed.data.timezone,
    })
    .eq("id", context.tenant.id)
    .select("id");

  // RLS: 0 linhas afetadas = sem permissão ou empresa suspensa.
  if (error || !data?.length) {
    logger.warn({
      event: "tenant.update",
      status: error ? "error" : "denied",
      tenant_id: context.tenant.id,
      user_id: context.user.id,
      code: error?.code,
    });
    return {
      status: "error",
      message: error ? toUserMessage(error) : toUserMessage({ message: "forbidden" }),
      values: safeFormValues(input),
    };
  }

  revalidatePath("/app", "layout");
  return { status: "success", message: "Dados da empresa atualizados." };
}

export async function acceptInvitationAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = tenantIdSchema.safeParse(formData.get("tenantId"));
  if (!parsed.success) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_tenant_invitation", { p_tenant_id: parsed.data });
  if (error) {
    logger.warn({
      event: "tenant_user.accept",
      status: "error",
      user_id: user.id,
      tenant_id: parsed.data,
      code: error.message,
    });
    redirect(`${ROUTES.onboarding}?erro=convite`);
  }

  (await cookies()).set(ACTIVE_TENANT_COOKIE, parsed.data, ACTIVE_TENANT_COOKIE_OPTIONS);
  redirect(ROUTES.appHome);
}

export async function declineInvitationAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = tenantIdSchema.safeParse(formData.get("tenantId"));
  if (!parsed.success) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_tenant_invitation", { p_tenant_id: parsed.data });
  if (error) {
    logger.warn({
      event: "tenant_user.decline",
      status: "error",
      user_id: user.id,
      tenant_id: parsed.data,
      code: error.message,
    });
  }
  revalidatePath(ROUTES.onboarding);
}
