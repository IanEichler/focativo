"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/domains/tenants/context";
import { getPublicEnv } from "@/lib/env";
import { GENERIC_ERROR_MESSAGE, toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { ROUTES } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";
import { listAssignableRoles } from "./queries";
import {
  changeRoleSchema,
  inviteUserSchema,
  membershipIdSchema,
  setActiveSchema,
  type InviteUserField,
} from "./schemas";

const USERS_PATH = "/app/usuarios";

/**
 * Convite:
 *  1. o BANCO decide se o ator pode atribuir o papel (list_assignable_roles);
 *  2. só então a conta é criada/convidada no Supabase Auth (secret key);
 *  3. a associação é criada pela RPC com a identidade do ator (revalida tudo).
 */
export async function inviteUserAction(
  _prev: ActionState<InviteUserField>,
  formData: FormData,
): Promise<ActionState<InviteUserField>> {
  const context = await requireTenantContext();
  const input = formDataToObject(formData);
  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const assignable = await listAssignableRoles(context);
  if (!context.can("users.invite") || !assignable.some((role) => role.code === parsed.data.roleCode)) {
    logger.warn({
      event: "tenant_user.invite",
      status: "denied",
      tenant_id: context.tenant.id,
      user_id: context.user.id,
    });
    return { status: "error", message: toUserMessage({ message: "role_hierarchy" }) };
  }

  const { NEXT_PUBLIC_APP_URL } = getPublicEnv();
  let accountCreated = false;

  const admin = createAdminClient();
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: `${NEXT_PUBLIC_APP_URL}${ROUTES.authConfirm}?next=${encodeURIComponent(ROUTES.resetPassword)}`,
  });

  if (!inviteError) {
    accountCreated = true;
  } else if (inviteError.code !== "email_exists" && inviteError.status !== 422) {
    logger.error({
      event: "tenant_user.invite",
      status: "error",
      stage: "auth_invite",
      tenant_id: context.tenant.id,
      user_id: context.user.id,
      code: inviteError.code,
    });
    return { status: "error", message: GENERIC_ERROR_MESSAGE, values: safeFormValues(input) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_tenant_user", {
    p_tenant_id: context.tenant.id,
    p_email: parsed.data.email,
    p_role_code: parsed.data.roleCode,
  });

  if (error) {
    logger.warn({
      event: "tenant_user.invite",
      status: "error",
      tenant_id: context.tenant.id,
      user_id: context.user.id,
      code: error.message,
    });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }

  logger.info({
    event: "tenant_user.invite",
    status: "ok",
    tenant_id: context.tenant.id,
    user_id: context.user.id,
    new_account: accountCreated,
  });
  revalidatePath(USERS_PATH);
  return {
    status: "success",
    message: accountCreated
      ? "Convite enviado por e-mail."
      : "Convite registrado. A pessoa verá o convite ao entrar na plataforma.",
  };
}

async function runMemberMutation(
  event: string,
  mutate: (
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => PromiseLike<{ error: { message: string; code?: string } | null }>,
  successMessage: string,
): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("users.manage")) {
    return { status: "error", message: toUserMessage({ message: "forbidden" }) };
  }

  const supabase = await createClient();
  const { error } = await mutate(supabase);
  if (error) {
    logger.warn({
      event,
      status: "error",
      tenant_id: context.tenant.id,
      user_id: context.user.id,
      code: error.message,
    });
    return { status: "error", message: toUserMessage(error) };
  }

  logger.info({ event, status: "ok", tenant_id: context.tenant.id, user_id: context.user.id });
  revalidatePath(USERS_PATH);
  return { status: "success", message: successMessage };
}

export async function changeMemberRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = changeRoleSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: "Selecione um papel válido." };
  return runMemberMutation(
    "tenant_user.role_change",
    (supabase) =>
      supabase.rpc("update_tenant_user_role", {
        p_membership_id: parsed.data.membershipId,
        p_role_code: parsed.data.roleCode,
      }),
    "Papel atualizado.",
  );
}

export async function setMemberActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = setActiveSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: GENERIC_ERROR_MESSAGE };
  return runMemberMutation(
    parsed.data.active ? "tenant_user.enable" : "tenant_user.disable",
    (supabase) =>
      supabase.rpc("set_tenant_user_status", {
        p_membership_id: parsed.data.membershipId,
        p_active: parsed.data.active,
      }),
    parsed.data.active ? "Acesso reativado." : "Acesso desativado.",
  );
}

export async function removeMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = membershipIdSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: GENERIC_ERROR_MESSAGE };
  return runMemberMutation(
    "tenant_user.remove",
    (supabase) => supabase.rpc("remove_tenant_user", { p_membership_id: parsed.data.membershipId }),
    "Usuário removido da empresa.",
  );
}
