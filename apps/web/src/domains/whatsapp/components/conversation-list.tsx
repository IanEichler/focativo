"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/data/status-badge";
import { CONVERSATION_STATUS_LABELS, CONVERSATION_STATUS_TONES } from "../labels";
import type { ConversationListItem } from "../queries";
import { initials, formatRelative } from "@/lib/format";
import { buildHref } from "@/lib/url";
import { cn } from "@/lib/utils";

export function ConversationList({
  conversations,
  emptyMessage = "Nenhuma conversa ainda.",
}: {
  conversations: ConversationListItem[];
  emptyMessage?: string;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeId = searchParams.get("conversa");

  if (conversations.length === 0) {
    return <p className="p-4 text-center text-small text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border overflow-y-auto">
      {conversations.map((conversation) => {
        const active = conversation.id === activeId;
        return (
          <li key={conversation.id}>
            <Link
              href={buildHref(pathname, searchParams, { conversa: conversation.id })}
              className={cn(
                "flex items-start gap-3 px-3 py-3 transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none",
                active && "bg-secondary",
              )}
            >
              <Avatar>
                {conversation.customerAvatarUrl && <AvatarImage src={conversation.customerAvatarUrl} alt="" />}
                <AvatarFallback className="bg-brand-100 text-caption font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                  {initials(conversation.customerName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-body font-medium">{conversation.customerName}</span>
                  {conversation.lastMessageAt && (
                    <span className="shrink-0 text-caption text-subtle">
                      {formatRelative(conversation.lastMessageAt)}
                    </span>
                  )}
                </div>
                <span className="truncate text-small text-muted-foreground">
                  {conversation.lastMessagePreview ?? "—"}
                </span>
                <div className="flex items-center gap-1.5">
                  <StatusBadge tone={CONVERSATION_STATUS_TONES[conversation.status]} className="text-caption">
                    {CONVERSATION_STATUS_LABELS[conversation.status]}
                  </StatusBadge>
                  {conversation.unreadCount > 0 && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-brand-600 text-caption font-semibold text-white">
                      {conversation.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
