import { fromChatId, toChatId } from "./phone";

interface ContactClient {
  getContactLidAndPhone(ids: string[]): Promise<{ lid: string; pn: string }[]>;
  getProfilePicUrl(id: string): Promise<string | undefined>;
}

/** Only a PN address or an explicit LID-to-PN mapping identifies a phone. */
export async function resolveContactPhone(client: ContactClient, chatId: string): Promise<string | null> {
  const phone = fromChatId(chatId);
  if (phone) return phone;
  if (!/^\d+@lid$/.test(chatId)) return null;
  const mappings = await client.getContactLidAndPhone([chatId]).catch(() => []);
  return fromChatId(mappings.find((entry) => entry.lid === chatId)?.pn ?? "") || null;
}

export async function resolveContactPhoto(client: ContactClient, chatId: string, phone: string | null) {
  // Some WhatsApp versions expose the picture under the PN, others under the LID.
  for (const id of new Set([chatId, ...(phone ? [toChatId(phone)] : [])])) {
    const url = await client.getProfilePicUrl(id).catch(() => undefined);
    if (url) return url;
  }
  return undefined;
}
