import { MessageCircleOff, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/feedback/access-denied";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { SearchInput } from "@/components/data/filter-controls";
import { resolveTab, TabNav } from "@/components/layout/tab-nav";
import { Button } from "@/components/ui/button";
import { listOpportunitiesByCustomer } from "@/domains/crm/queries";
import { getCustomerDetail } from "@/domains/customers/queries";
import { listReservationsByCustomer } from "@/domains/reservations/queries";
import { listSalesByCustomer } from "@/domains/sales/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { getConversationDetail, listConversations, listMessages } from "@/domains/whatsapp/queries";
import { ChatPanel } from "@/domains/whatsapp/components/chat-panel";
import { ConversationList } from "@/domains/whatsapp/components/conversation-list";
import { CustomerPanel } from "@/domains/whatsapp/components/customer-panel";
import { InboxAutoRefresh } from "@/domains/whatsapp/components/inbox-auto-refresh";
import { buildHref, firstParam } from "@/lib/url";

const FOLDERS = ["abertas", "finalizadas"] as const;

export const metadata: Metadata = { title: "Atendimento" };

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function AtendimentoPage({ searchParams }: PageProps<"/app/atendimento">) {
  const context = await requireTenantContext();
  if (!context.can("whatsapp.read") || !context.hasModule("whatsapp")) {
    return (
      <PageContainer>
        <PageHeader title="Atendimento" />
        <AccessDenied />
      </PageContainer>
    );
  }

  const params = await searchParams;
  const query = firstParam(params.busca)?.slice(0, 100);
  const conversationId = firstParam(params.conversa);
  const validId = conversationId && UUID_RE.test(conversationId) ? conversationId : undefined;
  const canWrite = context.can("whatsapp.write");
  const folder = resolveTab(firstParam(params.pasta), FOLDERS, "abertas");

  const conversations = await listConversations(context, { query, closed: folder === "finalizadas" });
  const conversation = validId ? await getConversationDetail(context, validId) : null;

  const [messages, customer, opportunities, reservations, sales] = conversation
    ? await Promise.all([
        listMessages(context, conversation.id),
        getCustomerDetail(context, conversation.customerId),
        listOpportunitiesByCustomer(context, conversation.customerId),
        listReservationsByCustomer(context, conversation.customerId),
        listSalesByCustomer(context, conversation.customerId),
      ])
    : [[], null, [], [], []];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <InboxAutoRefresh />
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <PageHeader title="Atendimento" />
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/whatsapp">
            <Settings className="size-4" /> Conexão WhatsApp
          </Link>
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr_320px]">
        <div className="flex min-h-0 flex-col border-b border-border lg:border-r lg:border-b-0">
          <div className="flex flex-col gap-3 border-b border-border p-3">
            <SearchInput param="busca" placeholder="Buscar conversa…" label="Buscar conversas" />
            <TabNav
              label="Pasta"
              active={folder}
              items={FOLDERS.map((value) => ({
                id: value,
                label: value === "abertas" ? "Conversas" : "Finalizados",
                href: buildHref("/app/atendimento", params, {
                  pasta: value === "abertas" ? undefined : value,
                  conversa: undefined,
                }),
              }))}
            />
          </div>
          <ConversationList
            conversations={conversations}
            emptyMessage={folder === "finalizadas" ? "Nenhum atendimento finalizado ainda." : "Nenhuma conversa ainda."}
          />
        </div>

        <div className="flex min-h-[50vh] flex-col lg:min-h-0">
          {conversation ? (
            <ChatPanel conversation={conversation} messages={messages} canWrite={canWrite} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
              <MessageCircleOff className="size-8" />
              <p className="text-body">Selecione uma conversa para ver as mensagens.</p>
            </div>
          )}
        </div>

        <div className="hidden min-h-0 border-l border-border lg:block">
          {customer && (
            <CustomerPanel
              customer={customer}
              opportunities={opportunities}
              reservations={reservations}
              sales={sales}
            />
          )}
        </div>
      </div>
    </div>
  );
}
