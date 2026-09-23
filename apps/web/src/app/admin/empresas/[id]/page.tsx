import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/data/status-badge";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminMemberActions } from "@/domains/admin/components/admin-member-actions";
import { AiPlatformLimitsCard } from "@/domains/admin/components/ai-platform-limits-card";
import { CreateTenantUserDialog } from "@/domains/admin/components/create-tenant-user-dialog";
import { ModuleFlagsCard } from "@/domains/admin/components/module-flags-card";
import { ResetPasswordDialog } from "@/domains/admin/components/reset-password-dialog";
import { TenantStatusDialog } from "@/domains/admin/components/tenant-status-dialog";
import { PLATFORM_ACTION_LABEL, TENANT_STATUS_LABEL } from "@/domains/admin/labels";
import { getAdminTenantDetail, getAiPlatformLimits, getDisabledModules } from "@/domains/admin/queries";
import { TENANT_SEGMENTS } from "@/domains/tenants/schemas";
import { formatCpfCnpj } from "@/lib/br-documents";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Empresa · Plataforma" };

function describeChange(before: unknown, after: unknown): string | null {
  const from = (before as { status?: string } | null)?.status;
  const to = (after as { status?: string } | null)?.status;
  if (!from || !to) return null;
  const label = (value: string) => TENANT_STATUS_LABEL[value as keyof typeof TENANT_STATUS_LABEL]?.label ?? value;
  return `${label(from)} → ${label(to)}`;
}

export default async function AdminTenantDetailPage({ params }: PageProps<"/admin/empresas/[id]">) {
  const { id } = await params;
  const [detail, disabledModules, aiPlatformLimits] = await Promise.all([
    getAdminTenantDetail(id),
    getDisabledModules(id),
    getAiPlatformLimits(id),
  ]);
  if (!detail) notFound();

  const { tenant, members, platformEvents } = detail;
  const status = TENANT_STATUS_LABEL[tenant.status];
  const segment = TENANT_SEGMENTS.find((item) => item.value === tenant.segment)?.label ?? tenant.segment;

  return (
    <PageContainer>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
          <Link href="/admin/empresas">
            <ArrowLeft /> Empresas
          </Link>
        </Button>
      </div>
      <PageHeader
        title={tenant.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            <span className="font-mono text-small">{tenant.slug}</span>
          </span>
        }
        actions={<TenantStatusDialog tenantId={tenant.id} tenantName={tenant.name} status={tenant.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Dados</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-body">
              {[
                ["Razão social", tenant.legalName],
                ["Documento", tenant.document ? formatCpfCnpj(tenant.document) : null],
                ["E-mail", tenant.email],
                ["Telefone", tenant.phone],
                ["Segmento", segment],
                ["Fuso horário", tenant.timezone],
                ["Cadastro", formatDate(tenant.createdAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <dt className="text-small text-muted-foreground">{label}</dt>
                  <dd className="break-words">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <ModuleFlagsCard tenantId={tenant.id} disabledModules={[...disabledModules]} />
        <AiPlatformLimitsCard tenantId={tenant.id} limits={aiPlatformLimits} />

        <Card>
          <CardHeader>
            <CardTitle>Usuários</CardTitle>
            <CardDescription>{members.length} vínculo(s)</CardDescription>
            <CardAction>
              <CreateTenantUserDialog tenantId={tenant.id} />
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border">
              {members.map((member) => (
                <li
                  key={member.membershipId}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{member.name}</span>
                    <span className="truncate text-small text-muted-foreground">{member.email}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-small">{member.roleName}</span>
                      {member.status !== "ACTIVE" && (
                        <StatusBadge tone={member.status === "INVITED" ? "info" : "neutral"} dot={false}>
                          {member.status === "INVITED" ? "Convite" : "Desativado"}
                        </StatusBadge>
                      )}
                    </div>
                    <ResetPasswordDialog userId={member.userId} userName={member.name} tenantId={tenant.id} />
                    <AdminMemberActions
                      membershipId={member.membershipId}
                      tenantId={tenant.id}
                      memberName={member.name}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Histórico da plataforma</CardTitle>
            <CardDescription>Ações administrativas sobre esta empresa.</CardDescription>
          </CardHeader>
          <CardContent>
            {platformEvents.length === 0 ? (
              <p className="text-body text-muted-foreground">Nenhuma ação administrativa registrada.</p>
            ) : (
              <ol className="flex flex-col gap-4">
                {platformEvents.map((event) => (
                  <li key={event.id} className="relative border-l border-border pl-4">
                    <span
                      aria-hidden="true"
                      className="absolute top-1.5 -left-[4.5px] size-2 rounded-full bg-border-strong"
                    />
                    <p className="text-body font-medium">
                      {PLATFORM_ACTION_LABEL[event.action] ?? event.action}
                      {describeChange(event.before, event.after) && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {describeChange(event.before, event.after)}
                        </span>
                      )}
                    </p>
                    {event.reason && <p className="text-small text-muted-foreground">{event.reason}</p>}
                    <p className="text-caption text-subtle tabular">{formatDateTime(event.createdAt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
