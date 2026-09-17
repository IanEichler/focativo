"use client";

import { Archive, MoreHorizontal, Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { DecimalField, SwitchField } from "@/components/forms/fields";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { FormSheet, SheetFormLayout } from "@/components/forms/form-sheet";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toDecimalInput } from "@/lib/decimal";
import { IDLE, type ActionState } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { archiveVariantAction, saveVariantAction } from "../actions/products";
import type { VariantField } from "../schemas";

export interface VariantFormValues {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  ownSalePrice: number | null;
  ownPromoPrice: number | null;
  ownMinStock: number | null;
  costPrice: number | null;
  variantIsActive: boolean;
}

interface VariantSheetProps {
  productId: string;
  productPrice: number;
  canEditCost: boolean;
  variant?: VariantFormValues;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function VariantSheet({ productId, productPrice, canEditCost, variant, trigger, open, onOpenChange }: VariantSheetProps) {
  return (
    <FormSheet
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={variant ? "Editar variação" : "Nova variação"}
      description={
        variant ? variant.name : "Ex.: sabor Chocolate. Campos de preço vazios herdam os valores do produto."
      }
    >
      {(close) => (
        <VariantForm
          productId={productId}
          productPrice={productPrice}
          canEditCost={canEditCost}
          variant={variant}
          onDone={close}
        />
      )}
    </FormSheet>
  );
}

function VariantForm({
  productId,
  productPrice,
  canEditCost,
  variant,
  onDone,
}: {
  productId: string;
  productPrice: number;
  canEditCost: boolean;
  variant?: VariantFormValues;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState<VariantField>, FormData>(saveVariantAction, IDLE);
  const values = state.status === "error" ? state.values : undefined;
  const pick = (field: VariantField, fallback: string | null | undefined) => values?.[field] ?? fallback ?? undefined;
  useActionFeedback(state, { onSuccess: onDone });

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col" noValidate>
      <input type="hidden" name="productId" value={productId} />
      {variant && <input type="hidden" name="variantId" value={variant.id} />}
      {canEditCost && <input type="hidden" name="canEditCost" value="on" />}
      <SheetFormLayout
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <SubmitButton pendingLabel="Salvando…">{variant ? "Salvar" : "Criar variação"}</SubmitButton>
          </>
        }
      >
        <FormMessage state={state.status === "error" ? state : IDLE} />
        <TextField
          label="Nome da variação"
          name="name"
          required
          autoFocus
          placeholder="Ex.: Chocolate"
          defaultValue={pick("name", variant?.name)}
          error={fieldError(state, "name")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="SKU"
            name="sku"
            autoComplete="off"
            className="uppercase"
            defaultValue={pick("sku", variant?.sku)}
            error={fieldError(state, "sku")}
          />
          <TextField
            label="Código de barras"
            name="barcode"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={pick("barcode", variant?.barcode)}
            error={fieldError(state, "barcode")}
          />
          <DecimalField
            label="Preço de venda"
            name="salePrice"
            prefix="R$"
            placeholder={toDecimalInput(productPrice)}
            description={`Vazio = ${formatMoney(productPrice)} (produto)`}
            defaultValue={pick("salePrice", toDecimalInput(variant?.ownSalePrice))}
            error={fieldError(state, "salePrice")}
          />
          <DecimalField
            label="Preço promocional"
            name="promoPrice"
            prefix="R$"
            description="Opcional"
            defaultValue={pick("promoPrice", toDecimalInput(variant?.ownPromoPrice))}
            error={fieldError(state, "promoPrice")}
          />
          {canEditCost && (
            <DecimalField
              label="Custo"
              name="costPrice"
              prefix="R$"
              defaultValue={pick("costPrice", toDecimalInput(variant?.costPrice))}
              error={fieldError(state, "costPrice")}
            />
          )}
          <DecimalField
            label="Estoque mínimo"
            name="minStock"
            placeholder="Herda do produto"
            defaultValue={pick("minStock", variant?.ownMinStock === null ? undefined : toDecimalInput(variant?.ownMinStock, 3))}
            error={fieldError(state, "minStock")}
          />
        </div>
        <SwitchField
          label="Variação ativa"
          name="isActive"
          defaultChecked={values ? values.isActive === "on" : (variant?.variantIsActive ?? true)}
        />
      </SheetFormLayout>
    </form>
  );
}

export function VariantRowActions({
  productId,
  productPrice,
  canEditCost,
  variant,
}: {
  productId: string;
  productPrice: number;
  canEditCost: boolean;
  variant: VariantFormValues;
}) {
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${variant.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil /> Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setArchiving(true)}>
            <Archive /> Arquivar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <VariantSheet
        productId={productId}
        productPrice={productPrice}
        canEditCost={canEditCost}
        variant={variant}
        open={editing}
        onOpenChange={setEditing}
      />
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title="Arquivar variação?"
        description={`${variant.name} deixará de ser vendida. Exige estoque zerado; o histórico é preservado.`}
        confirmLabel="Arquivar"
        destructive
        onConfirm={() => archiveVariantAction(productId, variant.id)}
      />
    </>
  );
}
