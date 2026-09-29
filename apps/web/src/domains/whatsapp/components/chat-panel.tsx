"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { Bot, CircleCheck, Pause, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/data/status-badge";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { IDLE, type ActionState } from "@/lib/errors";
import { formatDateTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  assumeConversationAction,
  closeConversationAction,
  pauseConversationAction,
  refreshCustomerAvatarAction,
  returnToAiAction,
  sendMessageAction,
} from "../actions";
import { CONVERSATION_STATUS_LABELS, CONVERSATION_STATUS_TONES, MESSAGE_STATUS_LABELS } from "../labels";
import type { ConversationDetail, MessageRow } from "../queries";
import type { SendMessageField } from "../schemas";
import { AiTypingIndicator } from "./ai-typing-indicator";

export function ChatPanel({
  conversation,
  messages,
  canWrite,
  stageControl,
}: {
  conversation: ConversationDetail;
  messages: MessageRow[];
  canWrite: boolean;
  stageControl?: React.ReactNode;
}) {
  const [state, action] = useActionState<ActionState<SendMessageField>, FormData>(sendMessageAction, IDLE);
  const [pending, startTransition] = useTransition();
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const followMessagesRef = useRef(true);
  const [content, setContent] = useState("");

  useEffect(() => {
    if (followMessagesRef.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  useActionFeedback(state, {
    onSuccess: () => {
      setContent("");
      followMessagesRef.current = true;
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    },
  });

  useEffect(() => {
    void refreshCustomerAvatarAction(conversation.customerId);
  }, [conversation.customerId]);

  function runTransition(fn: (id: string) => Promise<unknown>) {
    startTransition(async () => {
      await fn(conversation.id);
    });
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar>
            {conversation.customerAvatarUrl && <AvatarImage src={conversation.customerAvatarUrl} alt="" />}
            <AvatarFallback>{initials(conversation.customerName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-body font-medium">{conversation.customerName}</p>
            <StatusBadge tone={CONVERSATION_STATUS_TONES[conversation.status]}>
              {CONVERSATION_STATUS_LABELS[conversation.status]}
              {conversation.responsibleName ? ` · ${conversation.responsibleName}` : ""}
            </StatusBadge>
          </div>
        </div>
        {canWrite && conversation.status !== "CLOSED" && (
          <div className="flex flex-wrap items-center gap-2">
            {conversation.status !== "HUMAN_ACTIVE" && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => runTransition(assumeConversationAction)}
              >
                <User className="size-4" /> Assumir
              </Button>
            )}
            {conversation.status !== "AI_ACTIVE" && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => runTransition(returnToAiAction)}>
                <Bot className="size-4" /> Devolver à IA
              </Button>
            )}
            {conversation.status !== "PAUSED" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => runTransition(pauseConversationAction)}
              >
                <Pause className="size-4" /> Pausar
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setCloseDialogOpen(true)}>
              <CircleCheck className="size-4" /> Finalizar
            </Button>
          </div>
        )}
      </header>
      {stageControl}

      <ConfirmDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        title="Finalizar atendimento?"
        description={`A conversa com ${conversation.customerName} vai para "Finalizados". Na próxima mensagem, começa um novo atendimento com a IA, se ela estiver ativada e configurada.`}
        confirmLabel="Finalizar"
        onConfirm={() => closeConversationAction(conversation.id)}
      />

      <div
        ref={listRef}
        onScroll={() => {
          const list = listRef.current;
          if (list) followMessagesRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
        }}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        role="region"
        aria-label="Mensagens da conversa"
        tabIndex={0}
      >
        <ol className="flex flex-col gap-3">
          {messages.map((message) => {
            const outbound = message.direction === "OUTBOUND";
            return (
              <li key={message.id} className={cn("flex flex-col", outbound ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-body wrap-anywhere whitespace-pre-wrap sm:max-w-[75%]",
                    outbound ? "bg-brand-600 text-white" : "bg-secondary text-foreground",
                  )}
                >
                  {message.content ?? <span className="italic opacity-70">[{message.mediaType ?? "mídia"}]</span>}
                </div>
                <span className="mt-1 text-caption text-subtle">
                  {outbound && message.senderName ? `${message.senderName} · ` : ""}
                  {formatDateTime(message.createdAt)}
                  {outbound ? ` · ${MESSAGE_STATUS_LABELS[message.status]}` : ""}
                </span>
              </li>
            );
          })}
          {messages.length === 0 && (
            <p className="py-8 text-center text-small text-muted-foreground">Sem mensagens ainda.</p>
          )}
        </ol>
      </div>

      <AiTypingIndicator
        key={`${conversation.id}:${conversation.status}`}
        conversationId={conversation.id}
        active={conversation.status === "AI_ACTIVE"}
      />

      {canWrite ? (
        <form action={action} className="flex shrink-0 items-end gap-2 border-t border-border p-3">
          <input type="hidden" name="conversationId" value={conversation.id} />
          <textarea
            name="content"
            rows={1}
            placeholder="Escreva uma mensagem…"
            aria-label="Mensagem"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="max-h-32 min-w-0 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-body outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" disabled={!content.trim()}>
            Enviar
          </Button>
        </form>
      ) : (
        <p className="border-t border-border p-3 text-center text-small text-muted-foreground">
          Você não tem permissão para responder por aqui.
        </p>
      )}
    </div>
  );
}
