import { z } from "zod";
import { maskContractDate, validContractDate } from "./field-format";

export type ContractSessionInput = { number: number; date: string; time: string; serviceId: string; professionalId: string; notes: string };
export type ContractSessionPlan = ContractSessionInput & { startsAt: string; endsAt: string; serviceName: string };

export function contractSessionInputs(fields: Record<string, string>, form: FormData): ContractSessionInput[] {
  const sessions: ContractSessionInput[] = [];
  for (const [field, date] of Object.entries(fields)) {
    const match = /^sessao_(\d+)_data$/.exec(field);
    if (!match || !date.trim() || /^[_\s/.-]+$/.test(date)) continue;
    const number = Number(match[1]);
    if (number < 1 || number > 100 || !validContractDate(date)) throw new Error(`Confira a data da sessão ${number}.`);
    const time = String(form.get(`session_${number}_time`) ?? "");
    const serviceId = String(form.get(`session_${number}_serviceId`) ?? "");
    const professionalId = String(form.get(`session_${number}_professionalId`) ?? "");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !z.uuid().safeParse(serviceId).success || !z.uuid().safeParse(professionalId).success) {
      throw new Error(`Sessão ${number}: preencha horário, serviço e profissional para registrar na agenda após a assinatura.`);
    }
    const [day, month, year] = maskContractDate(date).split("/");
    sessions.push({ number, date: `${year}-${month}-${day}`, time, serviceId, professionalId,
      notes: [fields[`sessao_${number}_regiao`], fields[`sessao_${number}_observacoes`]].filter(Boolean).join(" · ").slice(0, 700) });
  }
  return sessions.sort((a, b) => a.number - b.number);
}

export function sessionAgendaError(code: string | null | undefined): string {
  const messages: Record<string, string> = {
    slot_unavailable: "O horário está ocupado. Escolha outro horário.",
    session_overlap: "Há sessões com horários sobrepostos. Confira as datas e horários.",
    outside_business_hours: "A sessão está fora do horário de funcionamento da clínica.",
    professional_unavailable: "O profissional não está disponível nessa data.",
    professional_not_eligible: "O profissional não atende o serviço selecionado.",
    service_unavailable: "O serviço selecionado não está ativo.",
    session_in_past: "A data e o horário da sessão já passaram. Escolha um horário futuro.",
    invalid_session_time: "Horário inválido no fuso da clínica.",
    forbidden: "Seu acesso não permite agendar essas sessões.",
  };
  return messages[code ?? ""] ?? "Não foi possível agendar a sessão. Confira os dados e tente novamente.";
}
