"use client";

import { Check, ChevronsUpDown, Minus, Plus, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { structuredSearchAction } from "@/domains/catalog/actions/search";
import type { SearchResultItem } from "@/domains/catalog/search";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { formatMoney, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CartLine {
  variantId: string;
  label: string;
  sku: string | null;
  price: number;
  available: number | null;
  quantity: number;
}

function ProductPickerButton({ onPick }: { onPick: (item: SearchResultItem) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      startTransition(async () => setResults(await structuredSearchAction({ query, inStockOnly: true })));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Buscar produto"
          className="justify-between font-normal"
        >
          <span className="text-muted-foreground">Buscar produto por nome ou SKU…</span>
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
            <CommandEmpty>Nenhum produto com estoque disponível.</CommandEmpty>
            <CommandGroup>
              {results.map((item) => (
                <CommandItem
                  key={item.variantId}
                  value={item.variantId}
                  onSelect={() => {
                    onPick(item);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check className="size-4 opacity-0" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">
                      {item.variantName !== item.productName
                        ? `${item.productName} — ${item.variantName}`
                        : item.productName}
                    </span>
                    <span className="text-caption text-muted-foreground">
                      {item.sku ?? "sem SKU"} · {item.currentPrice !== null ? formatMoney(item.currentPrice) : "—"} ·{" "}
                      {formatQuantity(item.availableQuantity)} disp.
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function Cart({ lines, onChange }: { lines: CartLine[]; onChange: (lines: CartLine[]) => void }) {
  function addItem(item: SearchResultItem) {
    if (lines.some((line) => line.variantId === item.variantId)) return;
    onChange([
      ...lines,
      {
        variantId: item.variantId,
        label: item.variantName !== item.productName ? `${item.productName} — ${item.variantName}` : item.productName,
        sku: item.sku,
        price: item.currentPrice ?? 0,
        available: item.availableQuantity,
        quantity: 1,
      },
    ]);
  }

  function setQuantity(variantId: string, quantity: number) {
    if (quantity <= 0) {
      onChange(lines.filter((line) => line.variantId !== variantId));
      return;
    }
    onChange(lines.map((line) => (line.variantId === variantId ? { ...line, quantity } : line)));
  }

  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

  return (
    <div className="flex flex-col gap-3">
      <ProductPickerButton onPick={addItem} />

      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-small text-muted-foreground">
          Nenhum produto adicionado.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {lines.map((line) => (
            <div key={line.variantId} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-medium">{line.label}</span>
                <span
                  className={cn(
                    "text-caption text-muted-foreground",
                    line.available !== null && line.quantity > line.available && "text-danger",
                  )}
                >
                  {line.sku ?? "sem SKU"} · {formatMoney(line.price)}
                  {line.available !== null && ` · ${formatQuantity(line.available)} disp.`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-7"
                  onClick={() => setQuantity(line.variantId, line.quantity - 1)}
                >
                  <Minus className="size-3.5" />
                </Button>
                <Input
                  value={line.quantity}
                  onChange={(event) => setQuantity(line.variantId, Number(event.target.value) || 0)}
                  className="h-7 w-14 text-center tabular"
                  inputMode="decimal"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-7"
                  onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <span className="w-20 shrink-0 text-right text-body font-medium tabular">
                {formatMoney(line.price * line.quantity)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground"
                onClick={() => onChange(lines.filter((l) => l.variantId !== line.variantId))}
                aria-label={`Remover ${line.label}`}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-3 text-body font-semibold">
        <span>Subtotal</span>
        <span className="tabular">{formatMoney(subtotal)}</span>
      </div>
    </div>
  );
}
