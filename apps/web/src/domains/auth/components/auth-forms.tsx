"use client";

import Link from "next/link";
import { useActionState } from "react";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { TextField } from "@/components/forms/text-field";
import { IDLE, type ActionState } from "@/lib/errors";
import { requestPasswordResetAction, signInAction, signUpAction, updatePasswordAction } from "../actions";
import type { ResetPasswordField, SignInField, SignUpField } from "../schemas";

const valueOf = <Field extends string>(state: ActionState<Field>, field: Field) =>
  state.status === "error" ? state.values?.[field] : undefined;

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState<ActionState<SignInField>, FormData>(signInAction, IDLE);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage state={state} />
      <TextField
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        autoFocus
        defaultValue={valueOf(state, "email")}
        error={fieldError(state, "email")}
      />
      <TextField
        label="Senha"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={fieldError(state, "password")}
        labelAction={
          <Link href="/recuperar-senha" className="text-small font-medium text-primary hover:underline">
            Esqueci minha senha
          </Link>
        }
      />
      <SubmitButton className="mt-1 w-full" size="lg" pendingLabel="Entrando…">
        Entrar
      </SubmitButton>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState<ActionState<SignUpField>, FormData>(signUpAction, IDLE);

  if (state.status === "success") {
    return <FormMessage state={state} />;
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Nome completo"
        name="fullName"
        autoComplete="name"
        required
        autoFocus
        defaultValue={valueOf(state, "fullName")}
        error={fieldError(state, "fullName")}
      />
      <TextField
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={valueOf(state, "email")}
        error={fieldError(state, "email")}
      />
      <TextField
        label="Senha"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        description="Mínimo de 8 caracteres, com letras e números."
        error={fieldError(state, "password")}
      />
      <SubmitButton className="mt-1 w-full" size="lg" pendingLabel="Criando conta…">
        Criar conta
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState<ActionState<"email">, FormData>(requestPasswordResetAction, IDLE);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      {state.status !== "success" && (
        <>
          <TextField
            label="E-mail"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            autoFocus
            defaultValue={valueOf(state, "email")}
            error={fieldError(state, "email")}
          />
          <SubmitButton className="w-full" size="lg" pendingLabel="Enviando…">
            Enviar link de redefinição
          </SubmitButton>
        </>
      )}
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState<ActionState<ResetPasswordField>, FormData>(updatePasswordAction, IDLE);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Nova senha"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        autoFocus
        description="Mínimo de 8 caracteres, com letras e números."
        error={fieldError(state, "password")}
      />
      <TextField
        label="Confirme a nova senha"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={fieldError(state, "confirmPassword")}
      />
      <SubmitButton className="mt-1 w-full" size="lg" pendingLabel="Salvando…">
        Salvar senha
      </SubmitButton>
    </form>
  );
}
