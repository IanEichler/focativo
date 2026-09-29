"use client";
import { useState } from "react";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import type { ProfessionalOption, ServiceRow } from "@/domains/agenda/queries";

export type ContractSchedulingOptions = { services: ServiceRow[]; professionals: ProfessionalOption[] };

export function SessionScheduleFields({ number, services, professionals }: ContractSchedulingOptions & { number: string }) {
  const [serviceId, setServiceId] = useState("");
  const service = services.find(item => item.id === serviceId);
  const eligible = service?.professionalUserIds.length ? professionals.filter(item => service.professionalUserIds.includes(item.userId)) : professionals;
  return <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
    <p className="text-small text-muted-foreground sm:col-span-2">Se preencher a data, informe os dados abaixo. A sessão entra na agenda após a assinatura. Horário local da clínica.</p>
    <input type="hidden" name={`field_sessao_${number}_procedimento`} value={service?.name ?? ""} />
    <SelectField label="Procedimento / serviço" name={`session_${number}_serviceId`} options={services.map(item => ({ value: item.id, label: `${item.name} · ${item.durationMinutes} min` }))} onValueChange={setServiceId} />
    <TextField label="Horário da sessão" name={`session_${number}_time`} type="time" />
    <SelectField key={serviceId} label="Profissional" name={`session_${number}_professionalId`} options={eligible.map(item => ({ value: item.userId, label: item.fullName }))} />
    {services.length === 0 && <p className="text-small text-warning">Cadastre um serviço ativo em Serviços e Horários para agendar.</p>}
  </div>;
}
