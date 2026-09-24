"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface FormDialogProps {
  title: string;
  description?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  size?: "md" | "lg";
  /** Renderizado apenas com o modal aberto: cada abertura começa com estado limpo. */
  children: (close: () => void) => React.ReactNode;
}

/** Modal central para criar/editar sem sair da tela. */
export function FormDialog({
  title,
  description,
  trigger,
  open,
  onOpenChange,
  size = "md",
  children,
}: FormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className={cn("flex max-h-[85vh] w-full flex-col gap-0 p-0", size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg")}
      >
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="text-section">{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        {isOpen && children(() => setOpen(false))}
      </DialogContent>
    </Dialog>
  );
}

/** Corpo rolável + rodapé fixo para formulários dentro do FormDialog. */
export function DialogFormLayout({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-5">{children}</div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">{footer}</div>
    </>
  );
}
