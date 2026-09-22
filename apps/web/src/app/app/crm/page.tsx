import type { Metadata } from "next";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { CrmBoard } from "@/domains/crm/components/crm-board";
import { listBoard, listStages } from "@/domains/crm/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { listTenantMembers } from "@/domains/users/queries";

export const metadata: Metadata = { title: "CRM" };

export default async function CrmPage() {
  const context = await requireTenantContext();
  if (!context.can("crm.read") || !context.hasModule("crm")) {
    return (
      <PageContainer>
        <PageHeader title="CRM" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const canWrite = context.can("crm.write");
  const [stages, cards, members] = await Promise.all([
    listStages(context),
    listBoard(context),
    canWrite ? listTenantMembers(context) : Promise.resolve([]),
  ]);

  const responsibles = members
    .filter((member) => member.status === "ACTIVE")
    .map((member) => ({ userId: member.userId, fullName: member.fullName }));

  return (
    <PageContainer>
      <PageHeader title="CRM" description="Acompanhe o funil de vendas: do primeiro contato ao fechamento." />

      {stages.length === 0 ? (
        <EmptyState
          title="Nenhuma etapa configurada"
          description="As etapas padrão são criadas automaticamente para a empresa."
        />
      ) : (
        <CrmBoard stages={stages} initialCards={cards} canWrite={canWrite} responsibles={responsibles} />
      )}
    </PageContainer>
  );
}
