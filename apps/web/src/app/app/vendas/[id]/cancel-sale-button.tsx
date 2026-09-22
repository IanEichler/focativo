"use client";

import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cancelSaleAction } from "@/domains/sales/actions";

export function CancelSaleButton({ saleId }: { saleId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button variant="outline" className="text-danger" onClick={() => setOpen(true)}>
        <Ban /> Cancelar venda
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancelar esta venda?"
        description="O estoque vendido será estornado (devolvido) automaticamente. A venda continua no histórico, marcada como cancelada."
        confirmLabel="Cancelar venda"
        destructive
        onConfirm={() => cancelSaleAction(saleId)}
        onSuccess={() => router.refresh()}
      />
    </>
  );
}
