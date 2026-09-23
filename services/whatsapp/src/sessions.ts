import fs from "node:fs";
import QRCode from "qrcode";
import pkg, { type Message } from "whatsapp-web.js";
import { config } from "./config";
import { ensureCountryCode, fromChatId, toChatId } from "./phone";
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * getContactLidAndPhone falha de forma intermitente para o MESMO contato
 * (confirmado ao vivo, em produção: funciona numa mensagem e falha na
 * seguinte) — não é um contato "sem LID", é o cache interno da lib ainda não
 * pronto no instante exato em que o evento de mensagem dispara. Tenta mais
 * algumas vezes com um respiro curto antes de desistir e cair no fallback.
 */
async function resolveLidPhoneWithRetry(client: WWebClient, lidChatId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(600);
    const lookup = await client.getContactLidAndPhone([lidChatId]).catch(() => []);
    if (lookup[0]?.pn) return fromChatId(lookup[0].pn);
  }
  return null;
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
      // Prioriza o número real resolvido pela lib: desde a migração do WhatsApp
      // para IDs "@lid" (privacidade), message.from pode ser um pseudo-ID sem
      // relação com o telefone — extrair dígitos dele produz lixo. Para a
      // maioria dos contatos, contact.number já resolve certo (caminho
      // rápido); alguns contatos "@lid" nunca preenchem contact.number
      // (confirmado ao vivo — não é questão de tempo/retry), mas
      // getContactLidAndPhone, a API dedicada da lib pra essa conversão,
      // resolve o telefone real mesmo assim.
      const contact = await message.getContact().catch(() => null);
      let resolvedNumber = contact?.number || null;
      if (!resolvedNumber) {
        resolvedNumber = await resolveLidPhoneWithRetry(client, message.from);
      }
      const whatsappNumber = ensureCountryCode(resolvedNumber || fromChatId(message.from));
      await postToApp({
        event: "message",
        tenantId,
        whatsappNumber,
        // Guardado à parte do telefone e reusado para responder: reconstruir
        // um endereço a partir só do telefone (toChatId/getNumberId) falha
        // silenciosamente ("No LID for user") para contatos migrados para
        // "@lid" — o único ID que sempre funciona é o que o WhatsApp manda
        // aqui, no recebimento.
        whatsappChatId: message.from,
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

/**
 * O suporte a "@lid" na lib ainda é parcial: confirmado ao vivo que o envio
 * chega de verdade no destinatário mesmo quando o objeto de retorno vem
 * incompleto (undefined ou sem .id) — não é falha de envio, só falta de
 * confirmação. Gera um id local nesse caso em vez de derrubar a chamada
 * (o que fazia a mensagem aparecer como "Falhou" mesmo tendo sido entregue).
 */
function externalIdOf(sent: { id?: { _serialized?: string } } | undefined): string {
  return sent?.id?._serialized ?? `local-${Date.now()}`;
}

export async function sendText(tenantId: string, to: string, text: string, chatId?: string): Promise<string> {
  const client = requireConnectedClient(tenantId);
  const target = chatId || (await resolveChatId(client, to));
  const sent = await client.sendMessage(target, text);
  return externalIdOf(sent);
}

export async function sendMedia(
  tenantId: string,
  to: string,
  mediaUrl: string,
  options: { caption?: string; filename?: string },
  chatId?: string,
): Promise<string> {
  const client = requireConnectedClient(tenantId);
  const target = chatId || (await resolveChatId(client, to));
  const { MessageMedia } = pkg;
  const media = await MessageMedia.fromUrl(mediaUrl, { filename: options.filename, unsafeMime: true });
  const sent = await client.sendMessage(target, media, { caption: options.caption });
  return externalIdOf(sent);
}

/** Diagnóstico: resolve telefone a partir de um @lid via a API dedicada da lib. */
export async function debugLidLookup(tenantId: string, lidChatId: string): Promise<unknown> {
  const client = requireConnectedClient(tenantId);
  return client.getContactLidAndPhone([lidChatId]);
}

export async function getContactInfo(
  tenantId: string,
  phone: string,
  chatId?: string,
): Promise<{ name?: string; profilePicUrl?: string } | null> {
  const client = requireConnectedClient(tenantId);
  const target = chatId || (await resolveChatId(client, phone));
  const contact = await client.getContactById(target).catch(() => null);
  if (!contact) return null;
  const profilePicUrl = await contact.getProfilePicUrl().catch(() => undefined);
  return { name: contact.pushname || contact.name || undefined, profilePicUrl };
}
