"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface FormSheetProps {
  title: string;
  description?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  size?: "md" | "lg";
  /** Renderizado apenas com o drawer aberto: cada abertura começa com estado limpo. */
  children: (close: () => void) => React.ReactNode;
}

/** Drawer lateral para criar/editar sem sair da tela. */
export function FormSheet({ title, description, trigger, open, onOpenChange, size = "md", children }: FormSheetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent
        side="right"
        className={cn("flex w-full flex-col gap-0 p-0", size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg")}
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle className="text-section">{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{title}</SheetDescription>
          )}
        </SheetHeader>
        {isOpen && children(() => setOpen(false))}
      </SheetContent>
    </Sheet>
  );
}

/** Corpo rolável + rodapé fixo para formulários dentro do FormSheet. */
export function SheetFormLayout({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-5">{children}</div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">{footer}</div>
    </>
  );
}
