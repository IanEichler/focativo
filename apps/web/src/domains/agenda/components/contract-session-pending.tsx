import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/domains/tenants/context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calendarDate, calendarTime, dateLabel } from "../calendar";
import { sessionAgendaError } from "@/domains/documents/session-plan";
import type { ContractSchedulingOptions } from "@/domains/documents/components/session-schedule-fields";
import { ContractSessionResolve } from "./contract-session-resolve";

export async function ContractSessionsPending({
  context,
  timeZone,
  ...options
}: ContractSchedulingOptions & { context: TenantContext; timeZone: string }) {
  const client = await createClient();
  const { data, error } = await client
    .from("contract_session_appointments")
    .select(
      "id,customer_id,signature_id,session_number,service_id,professional_user_id,starts_at,error_code,customer:customers(name),service:agenda_services(name)",
    )
    .eq("tenant_id", context.tenant.id)
    .is("appointment_id", null)
    .order("starts_at")
    .limit(100);
  if (error)
    return (
      <p role="alert" className="text-warning">
        Não foi possível consultar as sessões pendentes dos contratos. Atualize a página.
      </p>
    );
  if (!data?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessões de contratos que precisam de ajuste</CardTitle>
        <p className="text-small text-muted-foreground">
          Os contratos foram assinados. Resolva as pendências abaixo para confirmar os agendamentos.
        </p>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {data.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">
                {row.customer?.name ?? "Cliente"} · Sessão {row.session_number}
              </p>
              <p className="text-small">
                {row.service?.name} · {dateLabel(calendarDate(row.starts_at, timeZone))} às{" "}
                {calendarTime(row.starts_at, timeZone)}
              </p>
              <p className="text-small text-warning">{sessionAgendaError(row.error_code)}</p>
              {context.can("customers.read") && (
                <Link className="text-small underline" href={`/app/clientes/${row.customer_id}?aba=contratos`}>
                  Ver contrato no perfil
                </Link>
              )}
            </div>
            {context.can("agenda.write") && (
              <ContractSessionResolve
                {...options}
                sessionId={row.id}
                serviceId={row.service_id}
                professionalId={row.professional_user_id}
              />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
