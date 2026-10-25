"use client";
import { useState } from "react";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import type { ProfessionalOption, ServiceRow } from "@/domains/agenda/queries";

export type ContractSchedulingOptions = { services: ServiceRow[]; professionals: ProfessionalOption[] };

/** Valores iniciais vindos do "Preencher sessões" (o grupo é remontado ao aplicar). */
export type SessionScheduleDefaults = { serviceId?: string; time?: string; professionalId?: string };

export function eligibleProfessionals(services: ServiceRow[], professionals: ProfessionalOption[], serviceId: string) {
  const service = services.find(item => item.id === serviceId);
  return service?.professionalUserIds.length ? professionals.filter(item => service.professionalUserIds.includes(item.userId)) : professionals;
}

export function SessionScheduleFields({ number, services, professionals, defaults }: ContractSchedulingOptions & { number: string; defaults?: SessionScheduleDefaults }) {
  const [serviceId, setServiceId] = useState(defaults?.serviceId ?? "");
  const service = services.find(item => item.id === serviceId);
  const eligible = eligibleProfessionals(services, professionals, serviceId);
  const professionalDefault = eligible.some(item => item.userId === defaults?.professionalId) ? defaults?.professionalId : undefined;
  return <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
    <p className="text-small text-muted-foreground sm:col-span-2">Se preencher a data, informe os dados abaixo. A sessão entra na agenda após a assinatura. Horário local da clínica.</p>
    <input type="hidden" name={`field_sessao_${number}_procedimento`} value={service?.name ?? ""} />
    <SelectField label="Procedimento / serviço" name={`session_${number}_serviceId`} defaultValue={defaults?.serviceId || undefined} options={services.map(item => ({ value: item.id, label: `${item.name} · ${item.durationMinutes} min` }))} onValueChange={setServiceId} />
    <TextField label="Horário da sessão" name={`session_${number}_time`} type="time" defaultValue={defaults?.time} />
    <SelectField key={serviceId} label="Profissional" name={`session_${number}_professionalId`} defaultValue={serviceId === defaults?.serviceId ? professionalDefault : undefined} options={eligible.map(item => ({ value: item.userId, label: item.fullName }))} />
    {services.length === 0 && <p className="text-small text-warning">Cadastre um serviço ativo em Serviços e Horários para agendar.</p>}
  </div>;
}
