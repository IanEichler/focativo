import { Bot, Boxes, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { Logo, LogoMark } from "@/components/brand/logo";
import { SignInForm } from "@/domains/auth/components/auth-forms";
import { safeNextPath } from "@/lib/routes";
import { firstParam } from "@/lib/url";

export const metadata: Metadata = { title: "Entrar" };

const NOTICES: Record<string, string> = {
  link_invalido: "O link é inválido ou expirou. Solicite um novo.",
};

const HIGHLIGHTS = [
  { icon: Boxes, label: "Estoque em tempo real", description: "Lotes, validade e alertas sempre atualizados." },
  { icon: MessageCircle, label: "CRM e atendimento", description: "Kanban, timeline e WhatsApp num só lugar." },
  { icon: Bot, label: "Venda assistida por IA", description: "O assistente busca produto e reserva por você." },
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const rawNext = firstParam(params.next);
  const next = rawNext ? safeNextPath(rawNext) : undefined;
  const notice = NOTICES[firstParam(params.erro) ?? ""];

  return (
    <div className="dark flex min-h-dvh items-center justify-center bg-background p-3 sm:p-6">
      <div className="grid w-full max-w-[1080px] overflow-hidden rounded-3xl border border-border bg-background lg:grid-cols-[1.05fr_1fr] lg:border-border-strong">
        {/* Painel de marca — some em telas pequenas */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-neutral-graphite via-neutral-black to-neutral-black p-10 lg:flex">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-white/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 bottom-0 size-80 rounded-full bg-white/5 blur-3xl"
          />

          <Logo className="relative" />

          <div className="relative flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 className="text-title text-white">Bem-vindo de volta</h2>
              <p className="text-body text-white/60">
                Estoque, CRM, vendas e atendimento da sua empresa, tudo em um único painel.
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              {HIGHLIGHTS.map((item) => (
                <div key={item.label} className="flex items-start gap-3 rounded-xl bg-white/5 p-3.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                    <item.icon className="size-4" />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-body font-medium text-white">{item.label}</span>
                    <span className="text-small text-white/55">{item.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Formulário */}
        <div className="flex flex-col justify-center gap-7 px-6 py-10 sm:px-10 lg:px-14">
          <LogoMark className="size-10 lg:hidden" />

          <div className="flex flex-col gap-1.5">
            <h1 className="text-title text-foreground">Entrar</h1>
            <p className="text-body text-muted-foreground">Acesse o painel da sua empresa.</p>
          </div>

          {notice && (
            <p role="alert" className="-mt-3 rounded-lg bg-warning-soft px-3 py-2.5 text-body text-warning">
              {notice}
            </p>
          )}

          <SignInForm next={next} />
        </div>
      </div>
    </div>
  );
}
