import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";

export interface WhatsAppAccount {
  status: Enums<"whatsapp_status">;
  phoneNumber: string | null;
  qrCode: string | null;
  errorMessage: string | null;
  connectedAt: string | null;
  lastActivityAt: string | null;
}

export async function getWhatsAppAccount(context: TenantContext): Promise<WhatsAppAccount> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_accounts")
    .select("status, phone_number, qr_code, error_message, connected_at, last_activity_at")
    .eq("tenant_id", context.tenant.id)
    .maybeSingle();

  return {
    status: data?.status ?? "DISCONNECTED",
    phoneNumber: data?.phone_number ?? null,
    qrCode: data?.qr_code ?? null,
    errorMessage: data?.error_message ?? null,
    connectedAt: data?.connected_at ?? null,
    lastActivityAt: data?.last_activity_at ?? null,
  };
}

/** Conversas com ao menos uma mensagem não lida (usado no sino de notificações). */
export async function getUnreadConversationsCount(context: TenantContext): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", context.tenant.id)
    .gt("unread_count", 0);
  if (error) throw new Error(`getUnreadConversationsCount failed: ${error.code}`);
  return count ?? 0;
}

export interface ConversationListItem {
  id: string;
  customerId: string;
  customerName: string;
  status: Enums<"conversation_status">;
  responsibleName: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

export async function listConversations(
  context: TenantContext,
  params: { query?: string; unreadOnly?: boolean } = {},
): Promise<ConversationListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("conversations")
    .select(
      "id, customer_id, status, unread_count, last_message_at, last_message_preview, customer:customers(name), responsible:profiles!conversations_responsible_user_id_fkey(full_name)",
    )
    .eq("tenant_id", context.tenant.id);

  if (params.unreadOnly) query = query.gt("unread_count", 0);
  if (params.query) query = query.ilike("customer.name", `%${params.query}%`);

  const { data, error } = await query.order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`listConversations failed: ${error.code}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer?.name ?? "Cliente",
    status: row.status,
    responsibleName: row.responsible?.full_name ?? null,
    unreadCount: row.unread_count,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview,
  }));
}

export interface ConversationDetail extends ConversationListItem {
  responsibleUserId: string | null;
}

export async function getConversationDetail(
  context: TenantContext,
  conversationId: string,
): Promise<ConversationDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select(
      "id, customer_id, status, responsible_user_id, unread_count, last_message_at, last_message_preview, customer:customers(name), responsible:profiles!conversations_responsible_user_id_fkey(full_name)",
    )
    .eq("tenant_id", context.tenant.id)
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    customerId: data.customer_id,
    customerName: data.customer?.name ?? "Cliente",
    status: data.status,
    responsibleUserId: data.responsible_user_id,
    responsibleName: data.responsible?.full_name ?? null,
    unreadCount: data.unread_count,
    lastMessageAt: data.last_message_at,
    lastMessagePreview: data.last_message_preview,
  };
}

export interface MessageRow {
  id: string;
  direction: Enums<"message_direction">;
  senderType: Enums<"message_sender_type">;
  senderName: string | null;
  content: string | null;
  mediaPath: string | null;
  mediaType: string | null;
  status: Enums<"message_status">;
  failedReason: string | null;
  createdAt: string;
}

export async function listMessages(context: TenantContext, conversationId: string): Promise<MessageRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select(
      "id, direction, sender_type, sender_user_id, content, media_path, media_type, status, failed_reason, created_at",
    )
    .eq("tenant_id", context.tenant.id)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);

  const senderIds = [
    ...new Set((data ?? []).map((row) => row.sender_user_id).filter((id): id is string => Boolean(id))),
  ];
  const names = new Map<string, string>();
  if (senderIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", senderIds);
    for (const profile of profiles ?? []) names.set(profile.id, profile.full_name || profile.email || "Usuário");
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    direction: row.direction,
    senderType: row.sender_type,
    senderName: row.sender_user_id ? (names.get(row.sender_user_id) ?? "Usuário") : null,
    content: row.content,
    mediaPath: row.media_path,
    mediaType: row.media_type,
    status: row.status,
    failedReason: row.failed_reason,
    createdAt: row.created_at,
  }));
}
