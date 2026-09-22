import { Plus } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { StatusBadge } from "@/components/data/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CustomerDetail } from "@/domains/customers/queries";
import { originLabel } from "@/domains/customers/labels";
import { OpportunityFormSheet, type ResponsibleOption } from "@/domains/crm/components/opportunity-form";
import { stageTone } from "@/domains/crm/labels";
import { listOpportunitiesByCustomer, listStages } from "@/domains/crm/queries";
import type { TenantContext } from "@/domains/tenants/context";
import { formatDate, formatMoney } from "@/lib/format";

export async function OpportunitiesTab({
  context,
  customer,
  responsibles,
}: {
  context: TenantContext;
  customer: CustomerDetail;
  responsibles: ResponsibleOption[];
}) {
  if (!context.can("crm.read")) {
    return <EmptyState className="border-0" title="Sem acesso" description="Você não tem permissão para ver o CRM." />;
  }

  const [opportunities, stages] = await Promise.all([
    listOpportunitiesByCustomer(context, customer.id),
    listStages(context),
  ]);
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const canWrite = context.can("crm.write");

  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <div className="flex justify-end">
          <OpportunityFormSheet
            presetCustomer={{
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
              whatsapp: customer.whatsapp,
            }}
            responsibles={responsibles}
            trigger={
              <Button>
                <Plus /> Nova oportunidade
              </Button>
            }
          />
        </div>
      )}

      {opportunities.length === 0 ? (
        <EmptyState
          title="Nenhuma oportunidade"
          description="Registre o interesse do cliente para acompanhar no CRM."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {opportunities.map((opportunity) => {
            const stage = stageById.get(opportunity.stageId);
            return (
              <Card key={opportunity.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-medium">{opportunity.title ?? "Sem descrição"}</p>
                    <p className="text-small text-muted-foreground">
                      {originLabel(opportunity.origin)} · {formatDate(opportunity.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-body font-medium tabular">
                      {opportunity.estimatedValue !== null ? formatMoney(opportunity.estimatedValue) : "—"}
                    </span>
                    {stage && <StatusBadge tone={stageTone(stage.color)}>{stage.name}</StatusBadge>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
