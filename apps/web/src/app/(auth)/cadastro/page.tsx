import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/domains/auth/components/auth-card";
import { SignUpForm } from "@/domains/auth/components/auth-forms";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
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
  );
}
