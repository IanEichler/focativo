/** Grupos do WhatsApp usam o domínio "@g.us" no chatId — nunca é um cliente individual. */
export function isGroupChatId(chatId: string): boolean {
  return chatId.endsWith("@g.us");
}

/** Converte um telefone (com ou sem formatação) no chatId individual do WhatsApp Web. */
export function toChatId(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@c.us`;
}

/** Extrai só os dígitos de um chatId/número do WhatsApp (para exibir/gravar). */
export function fromChatId(chatId: string): string {
  return chatId.replace(/@c\.us$/, "").replace(/\D/g, "");
}

/**
 * Garante o código do país (55) num número brasileiro — contact.number às
 * vezes vem só com DDD + número (10-11 dígitos), sem o "55" na frente.
 * Números que já vêm com "55" (12-13 dígitos) ou de outro país (não BR)
 * passam direto.
 */
export function ensureCountryCode(digits: string): string {
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}
