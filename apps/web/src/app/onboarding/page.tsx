import { Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isSuperAdmin, requireUser } from "@/domains/auth/session";
import { acceptInvitationAction, declineInvitationAction } from "@/domains/tenants/actions";
import { CreateTenantForm } from "@/domains/tenants/components/create-tenant-form";
import { OnboardingSteps } from "@/domains/tenants/components/onboarding-steps";
import { getTenantContext } from "@/domains/tenants/context";
import { completedSteps } from "@/domains/tenants/onboarding";
import { listMyInvitations } from "@/domains/tenants/queries";
import { formatDate } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { firstParam } from "@/lib/url";

export const metadata: Metadata = { title: "Configurar empresa" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser(ROUTES.onboarding);
  const params = await searchParams;
  const creatingAnother = firstParam(params.nova) === "1";
  const inviteError = firstParam(params.erro) === "convite";

  const [context, invitations] = await Promise.all([getTenantContext(), listMyInvitations()]);
  if (context && !creatingAnother && invitations.length === 0) redirect(ROUTES.appHome);
  // Admin master sem empresa nem convite pendente: a conta existe pra
  // administrar a plataforma, não é um cliente — vai pro painel, não pro
  // onboarding de "crie sua empresa" (a menos que peça explicitamente).
  if (!context && !creatingAnother && invitations.length === 0 && (await isSuperAdmin())) redirect(ROUTES.admin);

  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center justify-between px-6">
        <Logo />
        {context && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={ROUTES.appHome}>Voltar ao painel</Link>
          </Button>
        )}
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-8 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[1fr_320px] lg:gap-12 lg:pt-12">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-title text-foreground">
              {creatingAnother ? "Nova empresa" : `Boas-vindas${firstName ? `, ${firstName}` : ""}`}
            </h1>
            <p className="text-body text-muted-foreground">
              {invitations.length > 0
                ? "Você tem convites pendentes. Aceite um convite ou crie sua própria empresa."
                : "Cadastre sua empresa para começar a organizar estoque, atendimento e vendas."}
            </p>
          </div>

          {inviteError && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-body text-danger">
              Não foi possível aceitar o convite. Ele pode ter sido cancelado.
            </p>
          )}

          {invitations.length > 0 && (
            <section aria-labelledby="convites" className="flex flex-col gap-3">
              <h2 id="convites" className="text-body font-medium text-muted-foreground">
                Convites pendentes
              </h2>
              {invitations.map((invitation) => (
                <Card key={invitation.tenantId} className="flex-row flex-wrap items-center gap-4 px-5 py-4">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
                    <Mail className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="truncate text-body font-medium">{invitation.tenantName}</p>
                    <p className="text-small text-muted-foreground">
                      {invitation.roleName}
                      {invitation.invitedBy ? ` · convidado por ${invitation.invitedBy}` : ""}
                      {invitation.invitedAt ? ` · ${formatDate(invitation.invitedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action={declineInvitationAction}>
                      <input type="hidden" name="tenantId" value={invitation.tenantId} />
                      <Button type="submit" variant="ghost" size="sm">
                        Recusar
                      </Button>
                    </form>
                    <form action={acceptInvitationAction}>
                      <input type="hidden" name="tenantId" value={invitation.tenantId} />
                      <Button type="submit" size="sm">
                        Aceitar
                      </Button>
                    </form>
                  </div>
                </Card>
              ))}
            </section>
          )}

          <Card className="gap-5 px-6 py-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-section">Criar empresa</h2>
              <p className="text-body text-muted-foreground">Você será o proprietário e poderá convidar sua equipe.</p>
            </div>
            <CreateTenantForm />
          </Card>
        </div>

        <aside className="lg:pt-2">
          <OnboardingSteps
            completed={completedSteps({ hasCompany: false, legalName: null, document: null, phone: null })}
            current="company"
            linkable={false}
          />
        </aside>
      </main>
    </div>
  );
}
