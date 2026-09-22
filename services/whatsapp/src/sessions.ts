import QRCode from "qrcode";
import pkg, { type Message } from "whatsapp-web.js";
import { config } from "./config";
import { fromChatId, toChatId } from "./phone";
import { postToApp } from "./webhook";

const { Client, LocalAuth } = pkg;
type WWebClient = InstanceType<typeof Client>;

export type SessionStatus = "DISCONNECTED" | "WAITING_QR" | "CONNECTED" | "ERROR";

export interface SessionState {
  status: SessionStatus;
  qrCode: string | null;
  phoneNumber: string | null;
  errorMessage: string | null;
}

interface Session {
  client: WWebClient;
  state: SessionState;
}

const sessions = new Map<string, Session>();

function idleState(): SessionState {
  return { status: "DISCONNECTED", qrCode: null, phoneNumber: null, errorMessage: null };
}

export function getSessionState(tenantId: string): SessionState {
  return sessions.get(tenantId)?.state ?? idleState();
}

/** Cria (se preciso) e inicia a sessão do tenant; idempotente — reconectar não recria o client. */
export async function connectSession(tenantId: string): Promise<void> {
  const existing = sessions.get(tenantId);
  if (existing) return;

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: tenantId, dataPath: config.sessionsPath }),
    puppeteer: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  });
  const session: Session = {
    client,
    state: { status: "WAITING_QR", qrCode: null, phoneNumber: null, errorMessage: null },
  };
  sessions.set(tenantId, session);

  client.on("qr", (qr: string) => {
    void (async () => {
      const qrCode = await QRCode.toDataURL(qr);
      session.state = { status: "WAITING_QR", qrCode, phoneNumber: null, errorMessage: null };
      await postToApp({ event: "qr", tenantId, qrCode });
    })();
  });

  client.on("ready", () => {
    void (async () => {
      const phoneNumber = client.info?.wid?.user ?? null;
      session.state = { status: "CONNECTED", qrCode: null, phoneNumber, errorMessage: null };
      await postToApp({ event: "ready", tenantId, phoneNumber });
    })();
  });

  client.on("disconnected", (reason: string) => {
    void (async () => {
      session.state = idleState();
      sessions.delete(tenantId);
      await postToApp({ event: "disconnected", tenantId, reason });
    })();
  });

  client.on("auth_failure", (message: string) => {
    void (async () => {
      session.state = { status: "ERROR", qrCode: null, phoneNumber: null, errorMessage: message };
      await postToApp({ event: "auth_failure", tenantId, reason: message });
    })();
  });

  client.on("message", (message: Message) => {
    void (async () => {
      if (message.fromMe) return;
      const contact = await message.getContact().catch(() => null);
      // Prioriza o número real resolvido pela lib: desde a migração do WhatsApp
      // para IDs "@lid" (privacidade), message.from pode ser um pseudo-ID sem
      // relação com o telefone — extrair dígitos dele produz lixo. contact.number
      // é a mesma pessoa resolvida via API do WhatsApp para o telefone real.
      const whatsappNumber = contact?.number || fromChatId(message.from);
      await postToApp({
        event: "message",
        tenantId,
        whatsappNumber,
        content: message.body || undefined,
        externalMessageId: message.id._serialized,
        senderName: contact?.pushname || contact?.name || undefined,
        mediaType: message.hasMedia ? message.type : undefined,
      });
    })();
  });

  await client.initialize();
}

export async function disconnectSession(tenantId: string): Promise<void> {
  const session = sessions.get(tenantId);
  if (!session) return;
  sessions.delete(tenantId);
  await session.client.logout().catch(() => session.client.destroy());
}

function requireConnectedClient(tenantId: string): WWebClient {
  const session = sessions.get(tenantId);
  if (!session || session.state.status !== "CONNECTED") {
    throw new Error("session_not_connected");
  }
  return session.client;
}

export async function sendText(tenantId: string, to: string, text: string): Promise<string> {
  const client = requireConnectedClient(tenantId);
  const sent = await client.sendMessage(toChatId(to), text);
  return sent.id._serialized;
}

export async function sendMedia(
  tenantId: string,
  to: string,
  mediaUrl: string,
  options: { caption?: string; filename?: string },
): Promise<string> {
  const client = requireConnectedClient(tenantId);
  const { MessageMedia } = pkg;
  const media = await MessageMedia.fromUrl(mediaUrl, { filename: options.filename, unsafeMime: true });
  const sent = await client.sendMessage(toChatId(to), media, { caption: options.caption });
  return sent.id._serialized;
}

export async function getContactInfo(
  tenantId: string,
  phone: string,
): Promise<{ name?: string; profilePicUrl?: string } | null> {
  const client = requireConnectedClient(tenantId);
  const contact = await client.getContactById(toChatId(phone)).catch(() => null);
  if (!contact) return null;
  const profilePicUrl = await contact.getProfilePicUrl().catch(() => undefined);
  return { name: contact.pushname || contact.name || undefined, profilePicUrl };
}
