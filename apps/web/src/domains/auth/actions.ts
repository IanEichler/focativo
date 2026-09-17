"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_TENANT_COOKIE } from "@/domains/tenants/context";
import { getPublicEnv } from "@/lib/env";
import { GENERIC_ERROR_MESSAGE, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { ROUTES, safeNextPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type ResetPasswordField,
  type SignInField,
  type SignUpField,
} from "./schemas";

function confirmUrl(next: string) {
  const { NEXT_PUBLIC_APP_URL } = getPublicEnv();
  return `${NEXT_PUBLIC_APP_URL}${ROUTES.authConfirm}?next=${encodeURIComponent(next)}`;
}

export async function signInAction(
  _prev: ActionState<SignInField>,
  formData: FormData,
): Promise<ActionState<SignInField>> {
  const input = formDataToObject(formData);
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    logger.warn({ event: "auth.sign_in", status: "denied", reason: error.code ?? error.name });
    if (error.code === "email_not_confirmed") {
      return {
        status: "error",
        message: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.",
        values: safeFormValues(input),
      };
    }
    if (error.status === 429 || error.code === "over_request_rate_limit") {
      return {
        status: "error",
        message: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        values: safeFormValues(input),
      };
    }
    return { status: "error", message: "E-mail ou senha incorretos.", values: safeFormValues(input) };
  }

  redirect(safeNextPath(parsed.data.next));
}

export async function signUpAction(
  _prev: ActionState<SignUpField>,
  formData: FormData,
): Promise<ActionState<SignUpField>> {
  const input = formDataToObject(formData);
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: confirmUrl(ROUTES.onboarding),
    },
  });

  if (error) {
    logger.warn({ event: "auth.sign_up", status: "error", reason: error.code ?? error.name });
    if (error.code === "weak_password") {
      return {
        status: "error",
        message: "Senha fraca. Use letras e números, com pelo menos 8 caracteres.",
        values: safeFormValues(input),
      };
    }
    if (error.status === 429 || error.code === "over_email_send_rate_limit") {
      return {
        status: "error",
        message: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        values: safeFormValues(input),
      };
    }
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return {
        status: "error",
        message: "Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha.",
        values: safeFormValues(input),
      };
    }
    return { status: "error", message: GENERIC_ERROR_MESSAGE, values: safeFormValues(input) };
  }

  logger.info({ event: "auth.sign_up", status: "ok", user_id: data.user?.id });

  if (data.session) redirect(ROUTES.onboarding);

  return {
    status: "success",
    message: "Conta criada. Enviamos um link de confirmação para o seu e-mail.",
  };
}

export async function requestPasswordResetAction(
  _prev: ActionState<"email">,
  formData: FormData,
): Promise<ActionState<"email">> {
  const input = formDataToObject(formData);
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: confirmUrl(ROUTES.resetPassword),
  });

  if (error) {
    logger.warn({ event: "auth.password_reset_request", status: "error", reason: error.code ?? error.name });
    if (error.status === 429) {
      return {
        status: "error",
        message: "Muitas solicitações. Aguarde alguns minutos e tente novamente.",
        values: safeFormValues(input),
      };
    }
  }

  // Resposta idêntica exista ou não a conta (evita enumeração de e-mails).
  return {
    status: "success",
    message: "Se houver uma conta com este e-mail, você receberá um link para redefinir a senha.",
  };
}

export async function updatePasswordAction(
  _prev: ActionState<ResetPasswordField>,
  formData: FormData,
): Promise<ActionState<ResetPasswordField>> {
  const input = formDataToObject(formData);
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return {
      status: "error",
      message: "O link expirou. Solicite uma nova redefinição de senha.",
      values: safeFormValues(input),
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logger.warn({
      event: "auth.password_update",
      status: "error",
      user_id: claims.claims.sub,
      reason: error.code ?? error.name,
    });
    if (error.code === "same_password") {
      return { status: "error", message: "A nova senha deve ser diferente da atual.", values: safeFormValues(input) };
    }
    if (error.code === "reauthentication_needed") {
      return {
        status: "error",
        message: "Por segurança, solicite um novo link de redefinição de senha.",
        values: safeFormValues(input),
      };
    }
    return { status: "error", message: GENERIC_ERROR_MESSAGE, values: safeFormValues(input) };
  }

  logger.info({ event: "auth.password_update", status: "ok", user_id: claims.claims.sub });
  redirect(ROUTES.appHome);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVE_TENANT_COOKIE);
  redirect(ROUTES.login);
}
