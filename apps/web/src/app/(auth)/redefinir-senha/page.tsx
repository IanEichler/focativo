import type { Metadata } from "next";
import { requireUser } from "@/domains/auth/session";
import { AuthCard } from "@/domains/auth/components/auth-card";
import { ResetPasswordForm } from "@/domains/auth/components/auth-forms";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Definir senha" };

export default async function ResetPasswordPage() {
  const user = await requireUser(ROUTES.resetPassword);

  return (
    <AuthCard
      title="Definir nova senha"
      description={user.email ? `Conta: ${user.email}` : "Escolha uma senha segura para sua conta."}
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
