/** A legacy LID may have been saved directly, or prefixed with 55. */
export function contactPhone(phone: string | null | undefined, chatId?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (chatId?.endsWith("@lid")) {
    const lid = chatId.split("@")[0];
    if (digits === lid || digits === `55${lid}`) return null;
  }
  return /^\d{10,15}$/.test(digits) ? digits : null;
}
