"use client";

import { Trash2 } from "lucide-react";
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
import { archiveCustomerAction } from "../actions";

/**
 * "Excluir" aqui arquiva o cliente, não apaga de verdade: toda criação de
 * cliente já grava um evento append-only na timeline (customer.created) —
 * uma exclusão de verdade cascatearia numa tentativa de apagar um registro
 * de auditoria, que o banco recusa sempre, sem exceção (decisão confirmada
 * com o usuário: preservar a garantia de histórico nunca ser apagado vale
 * mais que um "excluir" literal). Arquivar tira o cliente das listas ativas
 * e mantém tudo reversível — ainda exige digitar o nome pra confirmar.
 */
export function DeleteCustomerDialog({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const matches = typed.trim() === customerName;

  function close(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) setTyped("");
  }

  function confirm() {
    startTransition(async () => {
      const result = await archiveCustomerAction(customerId, true);
      if (result.status === "success") {
        toast.success("Cliente arquivado.");
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
            O cliente sai das listas ativas (compras, atendimento, mensagens de WhatsApp continuam preservados por
            auditoria — nunca são apagados). Você pode reativar depois em Clientes arquivados.
          </AlertDialogDescription>
        </AlertDialogHeader>

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
          <Button variant="destructive" disabled={pending || !matches} onClick={confirm}>
            {pending && <Spinner />}
            Excluir cliente
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
