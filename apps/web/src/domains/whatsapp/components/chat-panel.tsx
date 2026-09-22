"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { Bot, CircleCheck, Pause, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/data/status-badge";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { IDLE, type ActionState } from "@/lib/errors";
import { formatDateTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  assumeConversationAction,
  closeConversationAction,
  pauseConversationAction,
  returnToAiAction,
  sendMessageAction,
} from "../actions";
import { CONVERSATION_STATUS_LABELS, CONVERSATION_STATUS_TONES, MESSAGE_STATUS_LABELS } from "../labels";
import type { ConversationDetail, MessageRow } from "../queries";
import type { SendMessageField } from "../schemas";

export function ChatPanel({
  conversation,
  messages,
  canWrite,
}: {
  conversation: ConversationDetail;
  messages: MessageRow[];
  canWrite: boolean;
}) {
  const [state, action] = useActionState<ActionState<SendMessageField>, FormData>(sendMessageAction, IDLE);
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState("");

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  useActionFeedback(state, { onSuccess: () => setContent("") });

  function runTransition(fn: (id: string) => Promise<unknown>) {
    startTransition(async () => {
      await fn(conversation.id);
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{initials(conversation.customerName)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-body font-medium">{conversation.customerName}</p>
            <StatusBadge tone={CONVERSATION_STATUS_TONES[conversation.status]}>
              {CONVERSATION_STATUS_LABELS[conversation.status]}
              {conversation.responsibleName ? ` · ${conversation.responsibleName}` : ""}
            </StatusBadge>
          </div>
        </div>
        {conversation.status !== "CLOSED" && (
          <div className="flex items-center gap-2">
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
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => runTransition(closeConversationAction)}>
              <CircleCheck className="size-4" /> Finalizar
            </Button>
          </div>
        )}
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4">
        <ol className="flex flex-col gap-3">
          {messages.map((message) => {
            const outbound = message.direction === "OUTBOUND";
            return (
              <li key={message.id} className={cn("flex flex-col", outbound ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-lg px-3 py-2 text-body",
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

      {canWrite ? (
        <form action={action} className="flex items-end gap-2 border-t border-border p-3">
          <input type="hidden" name="conversationId" value={conversation.id} />
          <textarea
            name="content"
            rows={1}
            placeholder="Escreva uma mensagem…"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="max-h-32 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-body outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
