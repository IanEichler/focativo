/** Converte um telefone (com ou sem formatação) no chatId individual do WhatsApp Web. */
export function toChatId(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@c.us`;
}

/** Extrai só os dígitos de um chatId/número do WhatsApp (para exibir/gravar). */
export function fromChatId(chatId: string): string {
  return chatId.replace(/@c\.us$/, "").replace(/\D/g, "");
}
