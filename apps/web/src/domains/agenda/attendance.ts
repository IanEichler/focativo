export const EVALUATION_PREFIX = "[AVALIAÇÃO PRESENCIAL]";

export function appointmentServiceLabel(service: string, notes: string | null) {
  return notes?.startsWith(EVALUATION_PREFIX) ? `Avaliação — ${service}` : service;
}
