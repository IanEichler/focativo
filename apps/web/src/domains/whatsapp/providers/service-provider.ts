import "server-only";
import { signWebhookBody } from "@/lib/webhook-signature";
import type { ConnectionInfo, ContactInfo, SendResult, WhatsAppProvider } from "../provider";

/**
 * Provider real: fala HTTP com services/whatsapp (processo PM2 separado, com
 * whatsapp-web.js + Chromium — seção 33). Cada chamada é assinada com o mesmo
 * segredo que o serviço usa para assinar o webhook de volta (confiança
 * simétrica entre os dois processos, sem sessão de usuário nesse meio).
 */
export class ServiceWhatsAppProvider implements WhatsAppProvider {
  readonly code = "wwebjs";
  readonly isDev = false;

  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  private async call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const payload = JSON.stringify(body);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-signature": signWebhookBody(payload, this.secret) },
      body: payload,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`whatsapp_service_error:${error.error ?? response.status}`);
    }
    return response.json();
  }

  async requestConnection(tenantId: string): Promise<void> {
    await this.call(`/sessions/${tenantId}/connect`, {});
  }

  async disconnect(tenantId: string): Promise<void> {
    await this.call(`/sessions/${tenantId}/disconnect`, {});
  }

  async getConnectionStatus(tenantId: string): Promise<ConnectionInfo> {
    return this.call(`/sessions/${tenantId}/status`, {});
  }

  async sendText(tenantId: string, to: string, text: string, chatId?: string | null): Promise<SendResult> {
    return this.call(`/sessions/${tenantId}/send`, { to, type: "text", text, chatId: chatId ?? undefined });
  }

  async sendImage(
    tenantId: string,
    to: string,
    mediaUrl: string,
    caption?: string,
    chatId?: string | null,
  ): Promise<SendResult> {
    return this.call(`/sessions/${tenantId}/send`, {
      to,
      type: "image",
      mediaUrl,
      caption,
      chatId: chatId ?? undefined,
    });
  }

  async sendDocument(
    tenantId: string,
    to: string,
    mediaUrl: string,
    filename: string,
    chatId?: string | null,
  ): Promise<SendResult> {
    return this.call(`/sessions/${tenantId}/send`, {
      to,
      type: "document",
      mediaUrl,
      filename,
      chatId: chatId ?? undefined,
    });
  }

  async getContact(tenantId: string, phone: string, chatId?: string | null): Promise<ContactInfo | null> {
    return this.call(`/sessions/${tenantId}/contact`, { phone, chatId: chatId ?? undefined });
  }
}
