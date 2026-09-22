"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { DecimalField, TextareaField } from "@/components/forms/fields";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { FormSheet, SheetFormLayout } from "@/components/forms/form-sheet";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { IDLE, type ActionState } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  adjustStockAction,
  registerEntryAction,
  registerLossAction,
  searchVariantsAction,
  variantLotsAction,
} from "../actions";
import { formatQuantity } from "@/lib/format";
import { EXPIRY_STATUS } from "../labels";
import type { VariantOption } from "../queries";
import type { StockOperation } from "../schemas";

const NONE = "__none__";
const NEW_LOT = "__new__";

type Lot = Awaited<ReturnType<typeof variantLotsAction>>[number];

const TITLES: Record<StockOperation, { title: string; description: string; submit: string }> = {
  entry: { title: "Registrar entrada", description: "Recebimento de mercadoria.", submit: "Registrar entrada" },
  loss: {
    title: "Registrar perda",
    description: "Avaria, vencimento, furto ou consumo interno.",
    submit: "Registrar perda",
  },
  adjust: {
    title: "Ajustar estoque",
    description: "Informe a quantidade contada fisicamente.",
    submit: "Registrar ajuste",
  },
};

// -----------------------------------------------------------------------------
// Seletor de variante com busca
// -----------------------------------------------------------------------------

export function VariantPicker({
  value,
  onChange,
  error,
}: {
  value: VariantOption | null;
  onChange: (option: VariantOption) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<VariantOption[]>([]);
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      startTransition(async () => setOptions(await searchVariantsAction(query)));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-body font-medium">
        Produto
        <span aria-hidden="true" className="text-danger">
          *
        </span>
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={error ? true : undefined}
            className="h-auto min-h-9 justify-between py-2 text-left font-normal"
          >
            {value ? (
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{value.label}</span>
                <span className="text-caption text-muted-foreground">
                  {value.sku ? `${value.sku} · ` : ""}Disponível: {formatQuantity(value.available, value.unit)}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Buscar por nome, SKU ou código de barras…</span>
            )}
            <ChevronsUpDown className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Digite para buscar…" value={query} onValueChange={setQuery} />
            <CommandList>
              {loading && (
                <div className="flex items-center gap-2 px-3 py-2 text-small text-muted-foreground">
                  <Spinner /> Buscando…
                </div>
              )}
              <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.variantId}
                    value={option.variantId}
                    onSelect={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("size-4", value?.variantId === option.variantId ? "opacity-100" : "opacity-0")}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{option.label}</span>
                      <span className="text-caption text-muted-foreground">
                        {option.sku ?? "sem SKU"} · {formatQuantity(option.available, option.unit)} disp.
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Drawer de operação
// -----------------------------------------------------------------------------

interface StockOperationSheetProps {
  mode: StockOperation;
  variant?: VariantOption;
  suppliers?: { id: string; name: string }[];
  canSeeCosts: boolean;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function StockOperationSheet({
  mode,
  variant,
  suppliers = [],
  canSeeCosts,
  trigger,
  open,
  onOpenChange,
}: StockOperationSheetProps) {
  return (
    <FormSheet
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={TITLES[mode].title}
      description={variant ? variant.label : TITLES[mode].description}
    >
      {(close) => (
        <StockOperationForm
          mode={mode}
          initialVariant={variant}
          suppliers={suppliers}
          canSeeCosts={canSeeCosts}
          onDone={close}
        />
      )}
    </FormSheet>
  );
}

const ACTIONS = {
  entry: registerEntryAction,
  loss: registerLossAction,
  adjust: adjustStockAction,
} as const;

function StockOperationForm({
  mode,
  initialVariant,
  suppliers,
  canSeeCosts,
  onDone,
}: {
  mode: StockOperation;
  initialVariant?: VariantOption;
  suppliers: { id: string; name: string }[];
  canSeeCosts: boolean;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    ACTIONS[mode] as (prev: ActionState, formData: FormData) => Promise<ActionState>,
    IDLE,
  );
  // Uma chave por abertura do formulário: duplo clique ou reenvio não duplicam a movimentação.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [variant, setVariant] = useState<VariantOption | null>(initialVariant ?? null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotsLoading, startLots] = useTransition();
  const [lotChoice, setLotChoice] = useState<string>(mode === "adjust" ? NEW_LOT : NONE);
  const values = state.status === "error" ? (state.values as Record<string, string> | undefined) : undefined;
  useActionFeedback(state, { onSuccess: onDone });

  useEffect(() => {
    if (!variant?.trackLots) return;
    startLots(async () => {
      const result = await variantLotsAction(variant.variantId);
      setLots(result);
      if (mode === "adjust") setLotChoice(result[0]?.lotId ?? NEW_LOT);
    });
  }, [variant, mode]);

  const error = (field: string) => fieldError(state as ActionState<string>, field);
  const selectedLot = lots.find((lot) => lot.lotId === lotChoice);
  const lotLabel = (lot: Lot) =>
    `${lot.lotCode} · ${formatQuantity(lot.quantity, variant?.unit)}${lot.expiresOn ? ` · vence ${formatDate(lot.expiresOn)}` : ""}${
      lot.expiryStatus === "EXPIRED" || lot.expiryStatus === "EXPIRING"
        ? ` (${EXPIRY_STATUS[lot.expiryStatus].label.toLowerCase()})`
        : ""
    }`;

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col" noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {variant && <input type="hidden" name="variantId" value={variant.variantId} />}
      <SheetFormLayout
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <SubmitButton pendingLabel="Registrando…" disabled={!variant}>
              {TITLES[mode].submit}
            </SubmitButton>
          </>
        }
      >
        <FormMessage state={state.status === "error" ? state : IDLE} />

        {initialVariant ? (
          <div className="rounded-lg bg-secondary px-3 py-2.5 text-body">
            Disponível agora:{" "}
            <strong className="tabular">{formatQuantity(initialVariant.available, initialVariant.unit)}</strong>
          </div>
        ) : (
          <VariantPicker value={variant} onChange={setVariant} error={error("variantId")} />
        )}

        {mode === "entry" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <DecimalField
                label="Quantidade"
                name="quantity"
                required
                placeholder="0"
                defaultValue={values?.quantity}
                error={error("quantity")}
              />
              {canSeeCosts && (
                <DecimalField
                  label="Custo unitário"
                  name="unitCost"
                  prefix="R$"
                  description="Opcional"
                  defaultValue={values?.unitCost}
                  error={error("unitCost")}
                />
              )}
            </div>
            {variant?.trackLots && (
              <fieldset className="flex flex-col gap-4 rounded-xl border border-border p-4">
                <legend className="px-1 text-small font-medium">Lote</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Código do lote"
                    name="lotCode"
                    required
                    list="stock-entry-lots"
                    defaultValue={values?.lotCode}
                    description={lots.length ? "Código existente soma ao lote." : undefined}
                    error={error("lotCode")}
                  />
                  <datalist id="stock-entry-lots">
                    {lots.map((lot) => (
                      <option key={lot.lotId} value={lot.lotCode} />
                    ))}
                  </datalist>
                  <TextField
                    label="Validade"
                    name="expiresOn"
                    type="date"
                    defaultValue={values?.expiresOn}
                    error={error("expiresOn")}
                  />
                  <TextField
                    label="Fabricação"
                    name="manufacturedOn"
                    type="date"
                    defaultValue={values?.manufacturedOn}
                    error={error("manufacturedOn")}
                  />
                  <SelectField
                    label="Fornecedor"
                    name="supplierId"
                    options={[
                      { value: NONE, label: "Não informado" },
                      ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
                    ]}
                    defaultValue={values?.supplierId ?? NONE}
                  />
                </div>
              </fieldset>
            )}
            <TextareaField
              label="Observação"
              name="reason"
              rows={2}
              maxLength={500}
              placeholder="Ex.: NF 12345"
              defaultValue={values?.reason}
            />
          </>
        )}

        {mode === "loss" && (
          <>
            <DecimalField
              label="Quantidade perdida"
              name="quantity"
              required
              placeholder="0"
              defaultValue={values?.quantity}
              error={error("quantity")}
            />
            {variant?.trackLots && (
              <SelectField
                label="Lote"
                name="lotId"
                options={[
                  { value: NONE, label: "Automático (vence primeiro, sai primeiro)" },
                  ...lots.filter((lot) => lot.quantity > 0).map((lot) => ({ value: lot.lotId, label: lotLabel(lot) })),
                ]}
                defaultValue={values?.lotId ?? NONE}
                description={lotsLoading ? "Carregando lotes…" : undefined}
              />
            )}
            <TextareaField
              label="Motivo"
              name="reason"
              required
              rows={2}
              maxLength={500}
              placeholder="Ex.: embalagem danificada no recebimento"
              defaultValue={values?.reason}
              error={error("reason")}
            />
          </>
        )}

        {mode === "adjust" && (
          <>
            {variant?.trackLots && (
              <div className="flex flex-col gap-4">
                {lotsLoading ? (
                  <p className="flex items-center gap-2 text-small text-muted-foreground">
                    <Spinner /> Carregando lotes…
                  </p>
                ) : (
                  <SelectField
                    key={lots.map((lot) => lot.lotId).join()}
                    label="Lote contado"
                    name="lotId"
                    options={[
                      ...lots.map((lot) => ({ value: lot.lotId, label: lotLabel(lot) })),
                      { value: NEW_LOT, label: "Lote não cadastrado (novo)" },
                    ]}
                    defaultValue={lotChoice}
                    onValueChange={setLotChoice}
                  />
                )}
                {lotChoice === NEW_LOT && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="Código do lote"
                      name="lotCode"
                      required
                      defaultValue={values?.lotCode}
                      error={error("lotCode")}
                    />
                    <TextField
                      label="Validade"
                      name="expiresOn"
                      type="date"
                      defaultValue={values?.expiresOn}
                      error={error("expiresOn")}
                    />
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <DecimalField
                label="Quantidade contada"
                name="countedQuantity"
                required
                placeholder="0"
                defaultValue={values?.countedQuantity}
                description={
                  variant
                    ? `Registrado: ${formatQuantity(
                        variant.trackLots ? (selectedLot?.quantity ?? 0) : variant.physical,
                        variant.unit,
                      )}${variant.trackLots ? " no lote" : " em estoque físico"}`
                    : undefined
                }
                error={error("countedQuantity")}
              />
            </div>
            <TextareaField
              label="Motivo"
              name="reason"
              required
              rows={2}
              maxLength={500}
              placeholder="Ex.: inventário mensal"
              defaultValue={values?.reason}
              error={error("reason")}
            />
          </>
        )}
      </SheetFormLayout>
    </form>
  );
}
