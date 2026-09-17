import { Building2, CircleCheck, CirclePause, MailPlus, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MetricCard } from "@/components/data/metric-card";
import { PageContainer, PageHeader, SectionHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { getPlatformOverview } from "@/domains/admin/queries";
import { formatDateTime, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Visão geral · Plataforma" };

export default async function AdminOverviewPage() {
  const overview = await getPlatformOverview();
  const { tenants, users } = overview;

  return (
    <PageContainer>
      <PageHeader
        title="Visão geral"
        description={`Situação da plataforma · atualizado em ${formatDateTime(overview.generated_at)}`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/admin/empresas">Ver empresas</Link>
          </Button>
        }
      />

      <section className="flex flex-col gap-4">
        <SectionHeader title="Empresas" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total"
            value={formatNumber(tenants.total)}
            icon={<Building2 />}
            hint={`${formatNumber(tenants.new_this_month)} novas no mês`}
          />
          <MetricCard label="Ativas" value={formatNumber(tenants.active)} icon={<CircleCheck />} />
          <MetricCard label="Suspensas" value={formatNumber(tenants.suspended)} icon={<CirclePause />} />
          <MetricCard label="Canceladas" value={formatNumber(tenants.canceled)} icon={<Building2 />} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeader
          title="Usuários"
          description="Trial, inadimplência, MRR e consumo de IA entram com planos e assinaturas."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Contas"
            value={formatNumber(users.total)}
            icon={<UserRound />}
            hint={`${formatNumber(users.new_this_month)} novas no mês`}
          />
          <MetricCard label="Vínculos ativos" value={formatNumber(users.active_memberships)} icon={<Users />} />
          <MetricCard label="Convites pendentes" value={formatNumber(users.pending_invitations)} icon={<MailPlus />} />
        </div>
      </section>
    </PageContainer>
  );
}
