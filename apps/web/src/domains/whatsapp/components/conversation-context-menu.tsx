"use client";

import { Bot, CircleCheck, MailCheck, MessageCircle, Pause, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ContextMenu } from "radix-ui";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { GENERIC_ERROR_MESSAGE, type ActionState } from "@/lib/errors";
import { assumeConversationAction, closeConversationAction, markReadAction, pauseConversationAction, returnToAiAction } from "../actions";
import type { ConversationListItem } from "../queries";

const itemClass = "flex cursor-default select-none items-center gap-2 rounded-md px-3 py-2 text-body outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

export function ConversationContextMenu({ conversation, canWrite, href, children }: {
  conversation: ConversationListItem;
  canWrite: boolean;
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const canManage = canWrite && conversation.status !== "CLOSED";

  function run(action: (id: string) => Promise<ActionState>, message: string) {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await action(conversation.id);
        if (result.status === "error") toast.error(result.message);
        if (result.status === "success") {
          toast.success(message);
          router.refresh();
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
      } finally {
        busy.current = false;
      }
    });
  }

  return <>
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label={`Ações da conversa com ${conversation.customerName}`}
          collisionPadding={8}
          onCloseAutoFocus={(event) => { if (closeOpen) event.preventDefault(); }}
          className="z-50 min-w-56 max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <ContextMenu.Label className="max-w-64 truncate px-3 py-2 text-small font-medium text-muted-foreground">
            {pending ? "Atualizando atendimento…" : conversation.customerName}
          </ContextMenu.Label>
          <ContextMenu.Item asChild className={itemClass}>
            <Link href={href} scroll={false}><MessageCircle /> Abrir conversa</Link>
          </ContextMenu.Item>
          {conversation.unreadCount > 0 && <ContextMenu.Item className={itemClass} disabled={pending}
            onSelect={() => run(markReadAction, "Conversa marcada como lida.")}>
            <MailCheck /> Marcar como lida
          </ContextMenu.Item>}
          {canManage && <>
            <ContextMenu.Separator className="my-1 h-px bg-border" />
            {conversation.status !== "HUMAN_ACTIVE" && <ContextMenu.Item className={itemClass} disabled={pending}
              onSelect={() => run(assumeConversationAction, "Atendimento assumido.")}>
              <User /> Assumir atendimento
            </ContextMenu.Item>}
            {conversation.status !== "AI_ACTIVE" && <ContextMenu.Item className={itemClass} disabled={pending}
              onSelect={() => run(returnToAiAction, "Atendimento devolvido à IA.")}>
              <Bot /> Devolver à IA
            </ContextMenu.Item>}
            {conversation.status !== "PAUSED" && <ContextMenu.Item className={itemClass} disabled={pending}
              onSelect={() => run(pauseConversationAction, "Atendimento pausado.")}>
              <Pause /> Pausar atendimento
            </ContextMenu.Item>}
            <ContextMenu.Separator className="my-1 h-px bg-border" />
            <ContextMenu.Item className={itemClass} disabled={pending} onSelect={() => setCloseOpen(true)}>
              <CircleCheck /> Finalizar atendimento
            </ContextMenu.Item>
          </>}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
    <ConfirmDialog
      open={closeOpen}
      onOpenChange={setCloseOpen}
      title="Finalizar atendimento?"
      description={`A conversa com ${conversation.customerName} vai para "Finalizados". Na próxima mensagem, começa um novo atendimento com a IA, se ela estiver ativada e configurada.`}
      confirmLabel="Finalizar"
      onConfirm={async () => {
        try {
          return await closeConversationAction(conversation.id);
        } catch {
          return { status: "error", message: GENERIC_ERROR_MESSAGE };
        }
      }}
      onSuccess={() => router.refresh()}
    />
  </>;
}
