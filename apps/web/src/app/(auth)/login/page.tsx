import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/domains/auth/components/auth-card";
import { SignInForm } from "@/domains/auth/components/auth-forms";
import { safeNextPath } from "@/lib/routes";
import { firstParam } from "@/lib/url";

export const metadata: Metadata = { title: "Entrar" };

const NOTICES: Record<string, string> = {
  link_invalido: "O link é inválido ou expirou. Solicite um novo.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const rawNext = firstParam(params.next);
  const next = rawNext ? safeNextPath(rawNext) : undefined;
  const notice = NOTICES[firstParam(params.erro) ?? ""];

  return (
    <AuthCard
      title="Entrar"
      description="Acesse o painel da sua empresa."
      footer={
        <>
          Ainda não tem conta?{" "}
          <Link href="/cadastro" className="font-medium text-primary hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      {notice && (
        <p role="alert" className="-mt-2 rounded-lg bg-warning-soft px-3 py-2.5 text-body text-warning">
          {notice}
        </p>
      )}
      <SignInForm next={next} />
    </AuthCard>
  );
}
