"use client";

import { Archive, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { archiveCustomerAction, deleteCustomerAction } from "../actions";

/**
 * Excluir é excluir, arquivar é arquivar — duas ações separadas, cada uma
 * faz só o que o nome diz. Exclusão de verdade funciona (customer_purge
 * abre uma exceção estreita só pra mensagens/timeline); reservas,
 * pagamentos e agendamentos reais continuam bloqueando de propósito — o
 * erro chega honesto na tela, com um atalho pra arquivar em vez de insistir.
 */
export function DeleteCustomerDialog({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const matches = typed.trim() === customerName;

  function close(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) {
      setTyped("");
      setBlockedMessage(null);
    }
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteCustomerAction(customerId);
      if (result.status === "success") {
        toast.success(result.message);
        close(false);
        router.push("/app/clientes");
      } else if (result.status === "error") {
        setBlockedMessage(result.message);
      }
    });
  }

  function archiveInstead() {
    startTransition(async () => {
      const result = await archiveCustomerAction(customerId, true);
      if (result.status === "success") {
        toast.success(result.message);
        close(false);
        router.refresh();
      } else if (result.status === "error") {
        toast.error(result.message);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 /> Excluir
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {customerName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Isso apaga o cliente de vez, junto com as conversas de WhatsApp. Só não funciona se ele tiver reservas,
            pagamentos ou agendamentos reais — nesse caso, o banco recusa.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {blockedMessage && (
          <div className="flex flex-col gap-2 rounded-lg bg-danger-soft p-3 text-body text-danger">
            <p>{blockedMessage}</p>
            <Button size="sm" variant="outline" disabled={pending} onClick={archiveInstead}>
              {pending && <Spinner />}
              <Archive /> Arquivar em vez disso
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-customer-name" className="text-body font-medium">
            Digite <span className="font-semibold">{customerName}</span> para confirmar
          </Label>
          <Input
            id="confirm-customer-name"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoFocus
          />
        </div>

        <AlertDialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={pending || !matches} onClick={confirmDelete}>
            {pending && <Spinner />}
            Excluir cliente
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
