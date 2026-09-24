import { ClipboardList, Plus } from "lucide-react";
import type { Metadata } from "next";
import { DataTable, type DataTableColumn } from "@/components/data/data-table";
import { MoneyValue } from "@/components/data/money-value";
import { StatusBadge } from "@/components/data/status-badge";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { BusinessHoursCard } from "@/domains/agenda/components/business-hours-card";
import { ProfessionalExceptionsCard } from "@/domains/agenda/components/professional-exceptions-card";
import { ServiceFormSheet } from "@/domains/agenda/components/service-form";
import { getBusinessHours, getProfessionalExceptions, listServices, type ServiceRow } from "@/domains/agenda/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { listTenantMembers } from "@/domains/users/queries";
import { formatQuantity } from "@/lib/format";

export const metadata: Metadata = { title: "Serviços · Agenda" };

export default async function AgendaServicesPage() {
  const context = await requireTenantContext();
  if (!context.can("agenda.write") || !context.hasModule("agenda")) {
    return (
      <PageContainer>
        <PageHeader title="Serviços" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const [services, members, businessHours, exceptions] = await Promise.all([
    listServices(context),
    listTenantMembers(context),
    getBusinessHours(context),
    getProfessionalExceptions(context),
  ]);
  const professionals = members
    .filter((m) => m.status === "ACTIVE")
    .map((m) => ({ userId: m.userId, fullName: m.fullName }));

  const columns: DataTableColumn<ServiceRow>[] = [
    {
      id: "name",
      header: "Serviço",
      cell: (service) => (
        <div className="flex flex-col">
          <span className="font-medium">{service.name}</span>
          {service.description && (
            <span className="truncate text-small text-muted-foreground">{service.description}</span>
          )}
        </div>
      ),
    },
    {
      id: "duration",
      header: "Duração",
      cell: (service) => (
        <span className="text-muted-foreground">{formatQuantity(service.durationMinutes, "min")}</span>
      ),
    },
    { id: "price", header: "Preço", align: "right", cell: (service) => <MoneyValue value={service.price} /> },
    {
      id: "status",
      header: "Situação",
      cell: (service) => (
        <StatusBadge tone={service.isActive ? "success" : "neutral"}>
          {service.isActive ? "Ativo" : "Inativo"}
        </StatusBadge>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (service) => (
        <ServiceFormSheet
          professionals={professionals}
          service={service}
          trigger={
            <Button variant="ghost" size="sm">
              Editar
            </Button>
          }
        />
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Serviços"
        description="Catálogo de serviços oferecidos, usado nos agendamentos e pela assistente de IA."
        actions={
          <ServiceFormSheet
            professionals={professionals}
            trigger={
              <Button>
                <Plus /> Novo serviço
              </Button>
            }
          />
        }
      />

      <DataTable
        caption="Serviços"
        columns={columns}
        rows={services}
        getRowKey={(service) => service.id}
        empty={
          <EmptyState
            className="border-0"
            icon={<ClipboardList />}
            title="Nenhum serviço cadastrado"
            description="Cadastre os serviços que podem ser agendados pelos clientes."
            action={
              <ServiceFormSheet
                professionals={professionals}
                trigger={
                  <Button>
                    <Plus /> Cadastrar serviço
                  </Button>
                }
              />
            }
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <BusinessHoursCard hours={businessHours} />
        <ProfessionalExceptionsCard exceptions={exceptions} professionals={professionals} />
      </div>
    </PageContainer>
  );
}
