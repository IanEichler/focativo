import { ClipboardList, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import { DataTable, type DataTableColumn } from "@/components/data/data-table";
import { MoneyValue } from "@/components/data/money-value";
import { StatusBadge } from "@/components/data/status-badge";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BusinessHoursCard } from "@/domains/agenda/components/business-hours-card";
import { ProfessionalExceptionsCard } from "@/domains/agenda/components/professional-exceptions-card";
import { ServiceFormDialog } from "@/domains/agenda/components/service-form";
import { getBusinessHours, getProfessionalExceptions, listServices, type ServiceRow } from "@/domains/agenda/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { listTenantMembers } from "@/domains/users/queries";
import { formatQuantity } from "@/lib/format";

export const metadata: Metadata = { title: "Serviços e Horários · Agenda" };

export default async function AgendaServicesPage() {
  const context = await requireTenantContext();
  if (!context.can("agenda.write") || !context.hasModule("agenda")) {
    return (
      <PageContainer>
        <PageHeader title="Serviços e Horários" />
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
      className: "whitespace-normal",
      cell: (service) => (
        <div className="flex min-w-0 flex-col gap-2 py-1">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 font-medium wrap-anywhere">{service.name}</span>
            <ServiceFormDialog
              professionals={professionals}
              service={service}
              trigger={
                <Button variant="outline" size="sm" className="shrink-0" aria-label={`Editar serviço: ${service.name}`}>
                  <Pencil /> Editar serviço
                </Button>
              }
            />
          </div>
          {service.description && (
            <p className="text-small wrap-anywhere whitespace-pre-line text-muted-foreground">{service.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-small">
            <span className="text-muted-foreground">{formatQuantity(service.durationMinutes, "min")}</span>
            <MoneyValue value={service.price} />
            <StatusBadge tone={service.isActive ? "success" : "neutral"}>
              {service.isActive ? "Ativo" : "Inativo"}
            </StatusBadge>
          </div>
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Serviços e Horários"
        description="Catálogo de serviços, horário de funcionamento e exceções — usados nos agendamentos e pela assistente de IA."
      />

      <Tabs defaultValue="servicos">
        <TabsList>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="horarios">Horários</TabsTrigger>
        </TabsList>

        <TabsContent value="servicos" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <ServiceFormDialog
              professionals={professionals}
              trigger={
                <Button>
                  <Plus /> Novo serviço
                </Button>
              }
            />
          </div>
          <DataTable
            className="[&_table]:table-fixed"
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
                  <ServiceFormDialog
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
        </TabsContent>

        <TabsContent value="horarios" className="grid gap-6 lg:grid-cols-2">
          <BusinessHoursCard hours={businessHours} />
          <ProfessionalExceptionsCard exceptions={exceptions} professionals={professionals} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
