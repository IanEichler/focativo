/** Confirmation is emitted from the persisted booking receipt, never free-form model text. */
export function claimsCompletedBooking(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\*/g, "");
  return normalized.split(/[.!?\n]+/).some((sentence) => {
    if (/\b(nao|ainda|apos|quando|se)\b/.test(sentence)) return false;
    return (
      /\b(agendad[oa]s?|agendei|reservei|marquei)\b/.test(sentence) ||
      /\b(agendamento|avaliacao|sessao|horario|consulta)\b.{0,100}\b(confirmad[oa]|marcad[oa]|ficou para)\b/.test(
        sentence,
      ) ||
      /\b(confirmad[oa]|marcad[oa])\b.{0,60}\b(agendamento|avaliacao|sessao|horario|consulta)\b/.test(sentence)
    );
  });
}
