"use client";

import { ClipboardCheck, MinusCircle, MoreHorizontal, PlusCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { VariantOption } from "../queries";
import type { StockOperation } from "../schemas";
import { StockOperationSheet } from "./stock-operation";

export interface StockPermissions {
  entry: boolean;
  adjust: boolean;
  costs: boolean;
}

export function StockRowActions({
  variant,
  permissions,
  suppliers,
}: {
  variant: VariantOption;
  permissions: StockPermissions;
  suppliers: { id: string; name: string }[];
}) {
  const [mode, setMode] = useState<StockOperation | null>(null);
  if (!permissions.entry && !permissions.adjust) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Movimentar estoque de ${variant.label}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {permissions.entry && (
            <DropdownMenuItem onSelect={() => setMode("entry")}>
              <PlusCircle /> Entrada
            </DropdownMenuItem>
          )}
          {permissions.adjust && (
            <>
              <DropdownMenuItem onSelect={() => setMode("adjust")}>
                <ClipboardCheck /> Ajuste por contagem
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setMode("loss")}>
                <MinusCircle /> Perda
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {mode && (
        <StockOperationSheet
          mode={mode}
          variant={variant}
          suppliers={suppliers}
          canSeeCosts={permissions.costs}
          open
          onOpenChange={(open) => !open && setMode(null)}
        />
      )}
    </>
  );
}

/** Botões do cabeçalho: operação com busca de produto. */
export function StockOperationButtons({
  permissions,
  suppliers,
}: {
  permissions: StockPermissions;
  suppliers: { id: string; name: string }[];
}) {
  return (
    <>
      {permissions.adjust && (
        <>
          <StockOperationSheet
            mode="loss"
            suppliers={suppliers}
            canSeeCosts={permissions.costs}
            trigger={
              <Button variant="outline">
                <MinusCircle /> Perda
              </Button>
            }
          />
          <StockOperationSheet
            mode="adjust"
            suppliers={suppliers}
            canSeeCosts={permissions.costs}
            trigger={
              <Button variant="outline">
                <ClipboardCheck /> Ajuste
              </Button>
            }
          />
        </>
      )}
      {permissions.entry && (
        <StockOperationSheet
          mode="entry"
          suppliers={suppliers}
          canSeeCosts={permissions.costs}
          trigger={
            <Button>
              <PlusCircle /> Entrada
            </Button>
          }
        />
      )}
    </>
  );
}
