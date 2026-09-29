import { expect, it } from "vitest";
import { claimsCompletedBooking } from "./booking-claims";
it.each([
  "A avaliação ficou para *quarta-feira, às 19h, com Daniela*.",
  "Seu horário está confirmado.",
  "Agendei para amanhã.",
  "Agendamento confirmado: avaliação.",
])("blocks unverified claim: %s", (text) => expect(claimsCompletedBooking(text)).toBe(true));
it.each([
  "Posso agendar amanhã às 14h?",
  "O horário ainda não está confirmado.",
  "Não consegui agendar nesse horário.",
  "Tenho estas opções: 14h e 15h.",
])("allows non-confirmations: %s", (text) => expect(claimsCompletedBooking(text)).toBe(false));
