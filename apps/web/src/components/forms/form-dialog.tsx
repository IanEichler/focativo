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
        className={cn(
          "flex max-h-[85dvh] w-full flex-col gap-0 overflow-hidden p-0",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-12">
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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
        <div className="flex flex-col gap-5">{children}</div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
        {footer}
      </div>
    </>
  );
}
