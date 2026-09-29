import { ArrowLeft, MessageCircleOff, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/feedback/access-denied";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { SearchInput } from "@/components/data/filter-controls";
import { resolveTab, TabNav } from "@/components/layout/tab-nav";
import { Button } from "@/components/ui/button";
import { listOpportunitiesByCustomer, listStages } from "@/domains/crm/queries";
import { getCustomerDetail } from "@/domains/customers/queries";
import { listReservationsByCustomer } from "@/domains/reservations/queries";
import { listSalesByCustomer } from "@/domains/sales/queries";
import { requireTenantContext } from "@/domains/tenants/context";
import { getConversationDetail, listConversations, listMessages } from "@/domains/whatsapp/queries";
import { ChatPanel } from "@/domains/whatsapp/components/chat-panel";
import { ConversationList } from "@/domains/whatsapp/components/conversation-list";
import { CustomerPanel } from "@/domains/whatsapp/components/customer-panel";
import { InboxAutoRefresh } from "@/domains/whatsapp/components/inbox-auto-refresh";
import { ConversationStageControl } from "@/domains/whatsapp/components/conversation-stage-control";
import { cn } from "@/lib/utils";
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
  const canReadCrm = context.hasModule("crm") && context.can("crm.read");
  const folder = resolveTab(firstParam(params.pasta), FOLDERS, "abertas");

  const [conversations, conversation] = await Promise.all([
    listConversations(context, { query, closed: folder === "finalizadas" }),
    validId ? getConversationDetail(context, validId) : null,
  ]);

  const [messages, customer, opportunities, reservations, sales, stages] = conversation
    ? await Promise.all([
        listMessages(context, conversation.id),
        getCustomerDetail(context, conversation.customerId),
        canReadCrm ? listOpportunitiesByCustomer(context, conversation.customerId) : [],
        listReservationsByCustomer(context, conversation.customerId),
        listSalesByCustomer(context, conversation.customerId),
        canReadCrm ? listStages(context) : [],
      ])
    : [[], null, [], [], [], []];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <InboxAutoRefresh />
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-6">
        <PageHeader title="Atendimento" />
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/whatsapp">
            <Settings className="size-4" /> Conexão WhatsApp
          </Link>
        </Button>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_280px]">
        <div
          className={cn(
            "min-h-0 min-w-0 flex-col overflow-hidden border-border lg:flex lg:border-r",
            conversation ? "hidden" : "flex",
          )}
        >
          <div className="flex shrink-0 flex-col gap-3 border-b border-border p-3">
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
            canWrite={canWrite}
            emptyMessage={folder === "finalizadas" ? "Nenhum atendimento finalizado ainda." : "Nenhuma conversa ainda."}
          />
        </div>

        <div className={cn("min-h-0 min-w-0 flex-col overflow-hidden lg:flex", conversation ? "flex" : "hidden")}>
          {conversation ? (
            <>
              <Button asChild variant="ghost" size="sm" className="m-2 shrink-0 self-start lg:hidden">
                <Link href={buildHref("/app/atendimento", params, { conversa: undefined })} scroll={false}>
                  <ArrowLeft className="size-4" /> Conversas
                </Link>
              </Button>
              <ChatPanel
                key={conversation.id}
                conversation={conversation}
                messages={messages}
                canWrite={canWrite}
                stageControl={
                  canReadCrm ? (
                    <ConversationStageControl
                      opportunities={opportunities}
                      stages={stages}
                      canWrite={context.can("crm.write")}
                    />
                  ) : undefined
                }
              />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
              <MessageCircleOff className="size-8" />
              <p className="text-body">Selecione uma conversa para ver as mensagens.</p>
            </div>
          )}
        </div>

        <div className="hidden min-h-0 min-w-0 overflow-hidden border-l border-border xl:block">
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
