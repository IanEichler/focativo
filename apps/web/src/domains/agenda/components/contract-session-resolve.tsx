"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormDialog, DialogFormLayout } from "@/components/forms/form-dialog";
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { IDLE } from "@/lib/errors";
import { retryContractSessionAction } from "../contract-sessions";
import type { ContractSchedulingOptions } from "@/domains/documents/components/session-schedule-fields";

type Props = ContractSchedulingOptions & { sessionId: string; serviceId: string; professionalId: string };
export function ContractSessionResolve(props: Props) {
  return <FormDialog title="Agendar sessão do contrato" description="Ajuste o agendamento ou tente novamente no horário original. O contrato assinado permanece inalterado."
    trigger={<Button variant="outline" size="sm">Resolver agendamento</Button>}>
    {close => <ResolveForm {...props} onDone={close} />}
  </FormDialog>;
}
function ResolveForm({ sessionId, serviceId: initialServiceId, professionalId, services, professionals, onDone }: Props & { onDone: () => void }) {
  const [state, action] = useActionState(retryContractSessionAction, IDLE);
  const [adjust, setAdjust] = useState(false);
  const [serviceId, setServiceId] = useState(initialServiceId);
  const selected = services.find(item => item.id === serviceId);
  const eligible = selected?.professionalUserIds.length ? professionals.filter(item => selected.professionalUserIds.includes(item.userId)) : professionals;
  useActionFeedback(state, { onSuccess: onDone });
  return <form action={action} className="flex min-h-0 flex-1 flex-col">
    <input type="hidden" name="sessionId" value={sessionId} />
    <input type="hidden" name="adjust" value={String(adjust)} />
    <DialogFormLayout footer={<><Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button><SubmitButton pendingLabel="Agendando…">{adjust ? "Salvar agendamento" : "Tentar novamente"}</SubmitButton></>}>
      <FormMessage state={state} />
      <label className="flex items-center gap-2"><input type="checkbox" checked={adjust} onChange={event => setAdjust(event.target.checked)} />Ajustar data, horário ou profissional</label>
      {adjust && <>
        <SelectField label="Serviço" name="serviceId" defaultValue={serviceId} onValueChange={setServiceId} options={services.map(item => ({ value: item.id, label: item.name }))} />
        <div className="grid gap-4 sm:grid-cols-2"><TextField name="date" label="Nova data" type="date" required /><TextField name="time" label="Horário da clínica" type="time" required /></div>
        <SelectField key={serviceId} label="Profissional" name="professionalId" defaultValue={eligible.some(item => item.userId === professionalId) ? professionalId : undefined} options={eligible.map(item => ({ value: item.userId, label: item.fullName }))} />
      </>}
    </DialogFormLayout>
  </form>;
}
