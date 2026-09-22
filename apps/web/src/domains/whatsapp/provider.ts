import "server-only";

/**
 * Abstração de WhatsApp (seção 32 do escopo). Nenhum domínio comercial deve
 * depender de whatsapp-web.js diretamente — só desta interface. A
 * implementação real (`WWebJSProvider`) roda no serviço separado
 * (services/whatsapp) e fala com a aplicação por um webhook assinado; esta
 * interface só cobre o lado "aplicação chama o serviço".
 */
export interface SendResult {
  externalMessageId: string;
}

export interface ConnectionInfo {
  status: "DISCONNECTED" | "WAITING_QR" | "CONNECTED" | "ERROR";
  qrCode?: string;
  phoneNumber?: string;
  errorMessage?: string;
}

export interface ContactInfo {
  name?: string;
  profilePicUrl?: string;
}

export interface WhatsAppProvider {
  readonly code: string;
  readonly isDev: boolean;
  requestConnection(tenantId: string): Promise<void>;
  disconnect(tenantId: string): Promise<void>;
  getConnectionStatus(tenantId: string): Promise<ConnectionInfo>;
  sendText(tenantId: string, to: string, text: string): Promise<SendResult>;
  sendImage(tenantId: string, to: string, mediaUrl: string, caption?: string): Promise<SendResult>;
  sendDocument(tenantId: string, to: string, mediaUrl: string, filename: string): Promise<SendResult>;
  getContact(tenantId: string, phone: string): Promise<ContactInfo | null>;
}
