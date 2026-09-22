import type { StatusTone } from "@/components/data/status-badge";
import type { Enums } from "@/types/database.types";

type WhatsAppStatus = Enums<"whatsapp_status">;
type ConversationStatus = Enums<"conversation_status">;
type MessageStatus = Enums<"message_status">;

export const WHATSAPP_STATUS_LABELS: Record<WhatsAppStatus, string> = {
  DISCONNECTED: "Desconectado",
  WAITING_QR: "Aguardando leitura do QR Code",
  CONNECTED: "Conectado",
  ERROR: "Erro",
};

export const WHATSAPP_STATUS_TONES: Record<WhatsAppStatus, StatusTone> = {
  DISCONNECTED: "neutral",
  WAITING_QR: "warning",
  CONNECTED: "success",
  ERROR: "danger",
};

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  AI_ACTIVE: "IA atendendo",
  HUMAN_ACTIVE: "Atendimento humano",
  PAUSED: "Pausada",
  CLOSED: "Encerrada",
};

export const CONVERSATION_STATUS_TONES: Record<ConversationStatus, StatusTone> = {
  AI_ACTIVE: "brand",
  HUMAN_ACTIVE: "info",
  PAUSED: "neutral",
  CLOSED: "success",
};

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  QUEUED: "Enviando…",
  SENT: "Enviada",
  DELIVERED: "Entregue",
  READ: "Lida",
  FAILED: "Falhou",
};
