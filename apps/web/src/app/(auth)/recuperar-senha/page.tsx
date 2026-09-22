import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/domains/auth/components/auth-card";
import { AuthPageShell } from "@/domains/auth/components/auth-page-shell";
import { ForgotPasswordForm } from "@/domains/auth/components/auth-forms";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell>
      <AuthCard
        title="Recuperar senha"
        description="Informe seu e-mail e enviaremos um link para criar uma nova senha."
        footer={
          <Link href="/login" className="font-medium text-primary hover:underline">
            Voltar para o login
          </Link>
        }
      >
        <ForgotPasswordForm />
      </AuthCard>
    </AuthPageShell>
  );
}
