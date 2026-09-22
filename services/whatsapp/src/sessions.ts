import fs from "node:fs";
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

/**
 * Reconecta sozinho, no boot do processo, qualquer sessão salva em disco —
 * o LocalAuth grava uma pasta "session-<tenantId>" por conexão já feita.
 * Sem isso, todo restart (deploy, crash, reboot) deixa o WhatsApp mudo até
 * alguém notar e clicar em "conectar" de novo na tela (client.logout(), que
 * disconnectSession chama, apaga a pasta — então uma desconexão intencional
 * nunca é retomada por engano aqui).
 */
export async function resumeSavedSessions(): Promise<void> {
  let entries: string[];
  try {
    entries = fs.readdirSync(config.sessionsPath);
  } catch {
    return;
  }

  for (const entry of entries) {
    const tenantId = /^session-(.+)$/.exec(entry)?.[1];
    if (!tenantId) continue;
    connectSession(tenantId).catch((error: unknown) => {
      console.error(`[whatsapp-service] falha ao retomar sessão salva (tenant ${tenantId}):`, error);
    });
  }
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

/**
 * Resolve o ID de chat de verdade para um telefone via getNumberId (consulta
 * ao vivo ao WhatsApp) em vez de reconstruir "<dígitos>@c.us" à mão — desde a
 * migração para IDs "@lid", endereçar pelo telefone puro falha em silêncio
 * para parte dos contatos ("No LID for user"). Cai para o "@c.us" clássico
 * só se a consulta falhar (ex.: número não registrado no WhatsApp).
 */
async function resolveChatId(client: WWebClient, phone: string): Promise<string> {
  const contactId = await client.getNumberId(phone).catch(() => null);
  return contactId?._serialized ?? toChatId(phone);
}

export async function sendText(tenantId: string, to: string, text: string): Promise<string> {
  const client = requireConnectedClient(tenantId);
  const chatId = await resolveChatId(client, to);
  // DIAGNÓSTICO TEMPORÁRIO (remover depois de confirmar a causa do "No LID
  // for user"): registra o id resolvido e o erro completo, não só a mensagem.
  console.log(`[whatsapp-service] sendText: to=${to} resolvedChatId=${chatId}`);
  try {
    const sent = await client.sendMessage(chatId, text);
    return sent.id._serialized;
  } catch (error) {
    console.error(`[whatsapp-service] sendText falhou (to=${to} chatId=${chatId}):`, error);
    throw error;
  }
}

export async function sendMedia(
  tenantId: string,
  to: string,
  mediaUrl: string,
  options: { caption?: string; filename?: string },
): Promise<string> {
  const client = requireConnectedClient(tenantId);
  const chatId = await resolveChatId(client, to);
  const { MessageMedia } = pkg;
  const media = await MessageMedia.fromUrl(mediaUrl, { filename: options.filename, unsafeMime: true });
  const sent = await client.sendMessage(chatId, media, { caption: options.caption });
  return sent.id._serialized;
}

export async function getContactInfo(
  tenantId: string,
  phone: string,
): Promise<{ name?: string; profilePicUrl?: string } | null> {
  const client = requireConnectedClient(tenantId);
  const chatId = await resolveChatId(client, phone);
  const contact = await client.getContactById(chatId).catch(() => null);
  if (!contact) return null;
  const profilePicUrl = await contact.getProfilePicUrl().catch(() => undefined);
  return { name: contact.pushname || contact.name || undefined, profilePicUrl };
}
