import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import type { ConnectionInfo, ContactInfo, SendResult, WhatsAppProvider } from "../provider";

/**
 * Provider DEV: sem services/whatsapp rodando (nenhuma sessão Chromium real),
 * claramente identificado na UI. `requestConnection`/`disconnect` disparam o
 * mesmo webhook assinado que o serviço real dispararia — só quem envia é
 * simulado, não o pipeline. Como não há como escanear um QR de verdade sem um
 * celular, uma ação separada (`simulateWhatsAppEventAction`) simula o
 * "cliente escaneou" chamando esse mesmo webhook com o evento `ready`.
 */
export class DevWhatsAppProvider implements WhatsAppProvider {
  readonly code = "dev";
  readonly isDev = true;

  async requestConnection(): Promise<void> {
    // A geração do QR "de verdade" acontece via simulateWhatsAppEventAction
    // (evento 'qr'), disparando o webhook real — nada a fazer aqui além de
    // existir a chamada, mantendo a interface igual à do provider real.
  }

  async disconnect(): Promise<void> {
    // Idem: o estado é sempre refletido via webhook (evento 'disconnected').
  }

  async getConnectionStatus(tenantId: string): Promise<ConnectionInfo> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("whatsapp_accounts")
      .select("status, qr_code, phone_number, error_message")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!data) return { status: "DISCONNECTED" };
    return {
      status: data.status,
      qrCode: data.qr_code ?? undefined,
      phoneNumber: data.phone_number ?? undefined,
      errorMessage: data.error_message ?? undefined,
    };
  }

  async sendText(): Promise<SendResult> {
    return { externalMessageId: `dev_${randomUUID()}` };
  }

  async sendImage(): Promise<SendResult> {
    return { externalMessageId: `dev_${randomUUID()}` };
  }

  async sendDocument(): Promise<SendResult> {
    return { externalMessageId: `dev_${randomUUID()}` };
  }

  async getContact(): Promise<ContactInfo | null> {
    return null;
  }
}
