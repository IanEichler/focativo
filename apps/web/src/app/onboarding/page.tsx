import { Mail } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOutAction } from "@/domains/auth/actions";
import { requireUser } from "@/domains/auth/session";
import { acceptInvitationAction, declineInvitationAction } from "@/domains/tenants/actions";
import { getTenantContext } from "@/domains/tenants/context";
import { listMyInvitations } from "@/domains/tenants/queries";
import { formatDate } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { firstParam } from "@/lib/url";

export const metadata: Metadata = { title: "Acesso ao sistema" };

/**
 * Sistema de uma clínica só: não existe criar empresa. Quem entra sem acesso
 * vê os convites pendentes (aceitar entra na clínica) ou a orientação para
 * pedir acesso à responsável, que cadastra a pessoa em Usuários.
 */
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser(ROUTES.onboarding);
  const params = await searchParams;
  const inviteError = firstParam(params.erro) === "convite";

  const [context, invitations] = await Promise.all([getTenantContext(), listMyInvitations()]);
  if (context && invitations.length === 0) redirect(ROUTES.appHome);

  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center justify-between px-6">
        <Logo />
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Sair
          </Button>
        </form>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pt-6 pb-16 sm:px-6 lg:pt-12">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-title text-foreground">{`Olá${firstName ? `, ${firstName}` : ""}`}</h1>
          <p className="text-body text-muted-foreground">
            {invitations.length > 0
              ? "Você foi convidada para acessar o sistema. Aceite o convite para entrar."
              : "Sua conta ainda não tem acesso ao sistema. Peça para a responsável pela clínica cadastrar você em Usuários."}
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
      </main>
    </div>
  );
}
