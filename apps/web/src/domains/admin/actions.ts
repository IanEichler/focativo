"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getPublicEnv } from "@/lib/env";
import { GENERIC_ERROR_MESSAGE, toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { ROUTES } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";
import { Constants } from "@/types/database.types";
import { requireSuperAdmin } from "./guard";
import { passwordSchema } from "@/domains/auth/schemas";
import { businessTypeForSegment } from "@/domains/tenants/schemas";
import type { MemberPermissionDTO } from "@/domains/users/queries";
import {
  adminCreateTenantUserSchema,
  adminSetMemberPermissionsSchema,
  createTenantSchema,
  setModuleFlagSchema,
  type AdminCreateTenantUserField,
  type CreateTenantField,
} from "./schemas";

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

/**
 * Criação pelo admin master: convida/cria a conta do dono pela Admin API do
 * Auth (mesmo padrão de inviteUserAction) e só então chama a RPC — que exige
 * a conta já existir. O admin master nunca vira membro do tenant que cria.
 */
export async function createTenantAction(
  _prev: ActionState<CreateTenantField>,
  formData: FormData,
): Promise<ActionState<CreateTenantField>> {
  const admin = await requireSuperAdmin();
  const input = formDataToObject(formData);
  const parsed = createTenantSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const { NEXT_PUBLIC_APP_URL } = getPublicEnv();
  const authAdmin = createAdminClient();
  const { error: inviteError } = await authAdmin.auth.admin.inviteUserByEmail(parsed.data.ownerEmail, {
    redirectTo: `${NEXT_PUBLIC_APP_URL}${ROUTES.authConfirm}?next=${encodeURIComponent(ROUTES.resetPassword)}`,
  });
  if (inviteError && inviteError.code !== "email_exists" && inviteError.status !== 422) {
    logger.error({
      event: "admin.create_tenant",
      status: "error",
      stage: "auth_invite",
      user_id: admin.id,
      code: inviteError.code,
    });
    return { status: "error", message: GENERIC_ERROR_MESSAGE, values: safeFormValues(input) };
  }

  const supabase = await createClient();
  const { data: tenantId, error } = await supabase.rpc("admin_create_tenant", {
    p_name: parsed.data.name,
    p_segment: parsed.data.segment,
    p_owner_email: parsed.data.ownerEmail,
    p_business_type: businessTypeForSegment(parsed.data.segment),
  });

  if (error) {
    logger.warn({ event: "admin.create_tenant", status: "error", user_id: admin.id, code: error.message });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }

  logger.info({ event: "admin.create_tenant", status: "ok", user_id: admin.id, tenant_id: tenantId });
  revalidatePath("/admin/empresas");
  redirect(`/admin/empresas/${tenantId}`);
}

export async function setModuleFlagAction(input: {
  tenantId: string;
  moduleCode: string;
  enabled: boolean;
}): Promise<{ status: "success" | "error"; message?: string }> {
  const admin = await requireSuperAdmin();
  const parsed = setModuleFlagSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Dados inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_module_flag", {
    p_tenant_id: parsed.data.tenantId,
    p_module_code: parsed.data.moduleCode,
    p_enabled: parsed.data.enabled,
  });
  if (error) {
    logger.warn({ event: "admin.module_flag", status: "error", user_id: admin.id, code: error.message });
    return { status: "error", message: toUserMessage(error) };
  }

  logger.info({
    event: "admin.module_flag",
    status: "ok",
    user_id: admin.id,
    tenant_id: parsed.data.tenantId,
    module: parsed.data.moduleCode,
    enabled: parsed.data.enabled,
  });
  revalidatePath(`/admin/empresas/${parsed.data.tenantId}`);
  return { status: "success" };
}

const RESET_PASSWORD_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // sem 0/O/1/l/I, ambíguos

function generateTemporaryPassword(length = 14): string {
  const bytes = randomBytes(length);
  let password = Array.from(bytes, (b) => RESET_PASSWORD_CHARSET[b % RESET_PASSWORD_CHARSET.length]).join("");
  // Garante letra + número mesmo no caso (raríssimo) de o sorteio não incluir os dois.
  if (!/[A-Za-z]/.test(password)) password = "A" + password.slice(1);
  if (!/[0-9]/.test(password)) password = password.slice(0, -1) + "7";
  return password;
}

/**
 * Redefine a senha de um usuário direto pela Admin API do Auth — pensado
 * para suporte (conta sem acesso ao e-mail, recuperação urgente). A nova
 * senha só existe nesta resposta (nunca fica em log nem é persistida) — o
 * admin master precisa repassá-la ao usuário por um canal seguro. Aceita uma
 * senha escolhida pelo admin master (validada pela mesma política do
 * cadastro) ou gera uma automaticamente quando nenhuma é informada.
 */
export async function adminResetPasswordAction(
  userId: string,
  tenantId?: string,
  customPassword?: string,
): Promise<{ status: "success"; password: string } | { status: "error"; message: string }> {
  const admin = await requireSuperAdmin();
  if (!z.uuid().safeParse(userId).success) return { status: "error", message: toUserMessage({ message: "forbidden" }) };

  let password: string;
  if (customPassword) {
    const parsed = passwordSchema.safeParse(customPassword);
    if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Senha inválida." };
    password = parsed.data;
  } else {
    password = generateTemporaryPassword();
  }

  const authAdmin = createAdminClient();
  const { error } = await authAdmin.auth.admin.updateUserById(userId, { password });
  if (error) {
    logger.error({
      event: "admin.password_reset",
      status: "error",
      user_id: admin.id,
      target_user_id: userId,
      code: error.code,
    });
    return { status: "error", message: GENERIC_ERROR_MESSAGE };
  }

  const supabase = await createClient();
  await supabase.rpc("admin_log_password_reset", { p_target_user_id: userId, p_tenant_id: tenantId ?? undefined });

  logger.info({ event: "admin.password_reset", status: "ok", user_id: admin.id, target_user_id: userId });
  return { status: "success", password };
}

/**
 * Admin master criando um usuário DENTRO de uma empresa alheia, sem precisar
 * ser membro dela — mesma ideia de createTenantUserAction (conta já nasce
 * com senha), mas a associação usa admin_invite_tenant_user (gated por
 * require_super_admin, não por users.invite do próprio tenant).
 */
export async function adminCreateTenantUserAction(
  _prev: ActionState<AdminCreateTenantUserField>,
  formData: FormData,
): Promise<ActionState<AdminCreateTenantUserField>> {
  const admin = await requireSuperAdmin();
  const input = formDataToObject(formData);
  const parsed = adminCreateTenantUserSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const authAdmin = createAdminClient();
  const { data: created, error: createError } = await authAdmin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });

  if (createError) {
    const message =
      createError.code === "email_exists"
        ? "Já existe uma conta com este e-mail. Peça pro dono da empresa convidá-la, ou use outro e-mail."
        : GENERIC_ERROR_MESSAGE;
    logger.warn({
      event: "admin.tenant_user_create",
      status: "error",
      stage: "auth_create",
      user_id: admin.id,
      code: createError.code,
    });
    return { status: "error", message, values: safeFormValues(input) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_invite_tenant_user", {
    p_tenant_id: parsed.data.tenantId,
    p_email: parsed.data.email,
    p_role_code: parsed.data.roleCode,
    p_active: true,
  });

  if (error) {
    logger.warn({
      event: "admin.tenant_user_create",
      status: "error",
      stage: "membership",
      user_id: admin.id,
      tenant_id: parsed.data.tenantId,
      target_user_id: created.user.id,
      code: error.message,
    });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }

  logger.info({
    event: "admin.tenant_user_create",
    status: "ok",
    user_id: admin.id,
    tenant_id: parsed.data.tenantId,
    target_user_id: created.user.id,
  });
  revalidatePath(`/admin/empresas/${parsed.data.tenantId}`);
  return { status: "success", message: "Usuário criado. Repasse a senha por um canal seguro." };
}

export async function adminRemoveTenantUserAction(
  membershipId: string,
  tenantId: string,
): Promise<{ status: "success" | "error"; message?: string }> {
  const admin = await requireSuperAdmin();
  if (!z.uuid().safeParse(membershipId).success) {
    return { status: "error", message: toUserMessage({ message: "forbidden" }) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_tenant_user", { p_membership_id: membershipId });
  if (error) {
    logger.warn({ event: "admin.tenant_user_remove", status: "error", user_id: admin.id, code: error.message });
    return { status: "error", message: toUserMessage(error) };
  }

  logger.info({ event: "admin.tenant_user_remove", status: "ok", user_id: admin.id, membership_id: membershipId });
  revalidatePath(`/admin/empresas/${tenantId}`);
  return { status: "success", message: "Usuário removido da empresa." };
}

export async function getAdminMemberPermissionsAction(
  membershipId: string,
): Promise<{ status: "success"; permissions: MemberPermissionDTO[] } | { status: "error"; message: string }> {
  await requireSuperAdmin();
  if (!z.uuid().safeParse(membershipId).success) {
    return { status: "error", message: toUserMessage({ message: "forbidden" }) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_tenant_user_permissions", {
    p_membership_id: membershipId,
  });
  if (error) return { status: "error", message: GENERIC_ERROR_MESSAGE };

  return {
    status: "success",
    permissions: (data ?? []).map((row) => ({
      code: row.permission_code,
      granted: row.granted,
      isOverride: row.is_override,
      roleDefault: row.role_default,
    })),
  };
}

export async function adminSetMemberPermissionsAction(input: {
  membershipId: string;
  overrides: { code: string; granted: boolean }[];
  tenantId: string;
}): Promise<{ status: "success" | "error"; message?: string }> {
  const admin = await requireSuperAdmin();
  const parsed = adminSetMemberPermissionsSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Dados inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_tenant_user_permissions", {
    p_membership_id: parsed.data.membershipId,
    p_overrides: parsed.data.overrides,
  });
  if (error) {
    logger.warn({ event: "admin.tenant_user_permissions", status: "error", user_id: admin.id, code: error.message });
    return { status: "error", message: toUserMessage(error) };
  }

  logger.info({
    event: "admin.tenant_user_permissions",
    status: "ok",
    user_id: admin.id,
    membership_id: parsed.data.membershipId,
  });
  revalidatePath(`/admin/empresas/${input.tenantId}`);
  return { status: "success", message: "Permissões atualizadas." };
}
