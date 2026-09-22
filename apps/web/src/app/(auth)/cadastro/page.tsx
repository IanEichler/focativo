import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/domains/auth/components/auth-card";
import { AuthPageShell } from "@/domains/auth/components/auth-page-shell";
import { SignUpForm } from "@/domains/auth/components/auth-forms";

export const metadata: Metadata = { title: "Criar conta" };

/**
 * Autocadastro desativado: empresas hoje são criadas pelo admin master
 * (admin_create_tenant) ou por convite, não por um visitante se cadastrando
 * sozinho. Formulário/action continuam intactos — reative trocando para `true`.
 */
const SIGNUP_ENABLED = false;

export default function SignUpPage() {
  if (!SIGNUP_ENABLED) redirect("/login");

  return (
    <AuthPageShell>
      <AuthCard
        title="Criar conta"
        description="Em seguida você cadastra sua empresa."
        footer={
          <>
            Já tem conta?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Entrar
            </Link>
          </>
        }
      >
        <SignUpForm />
      </AuthCard>
    </AuthPageShell>
  );
}
