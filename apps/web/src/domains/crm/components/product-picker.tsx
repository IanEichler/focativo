"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { structuredSearchAction } from "@/domains/catalog/actions/search";
import type { SearchRequirement, SearchResultItem } from "@/domains/catalog/search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PickedProduct {
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
}

/** Chips rápidos: exercitam o ProductCompatibilityEngine direto na busca do vendedor. */
const QUICK_REQUIREMENTS: { label: string; requirement: SearchRequirement }[] = [
  { label: "Sem lactose", requirement: { type: "ALLERGEN_ABSENT", code: "lactose", level: "HEALTH_RELATED" } },
  { label: "Sem glúten", requirement: { type: "ALLERGEN_ABSENT", code: "gluten", level: "HEALTH_RELATED" } },
  { label: "Sem leite", requirement: { type: "ALLERGEN_ABSENT", code: "milk", level: "HEALTH_RELATED" } },
];

const COMPATIBILITY_LABEL: Record<SearchResultItem["compatibilityStatus"], string> = {
  COMPATIBLE: "Compatível",
  INCOMPATIBLE: "Incompatível",
  UNKNOWN: "Informação insuficiente",
};

const COMPATIBILITY_TONE: Record<SearchResultItem["compatibilityStatus"], string> = {
  COMPATIBLE: "bg-success-soft text-success",
  INCOMPATIBLE: "bg-danger-soft text-danger",
  UNKNOWN: "bg-warning-soft text-warning",
};

export function ProductPicker({
  selected,
  onChange,
}: {
  selected: PickedProduct[];
  onChange: (items: PickedProduct[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeChips, setActiveChips] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    const requirements = QUICK_REQUIREMENTS.filter((chip) => activeChips.includes(chip.label)).map(
      (chip) => chip.requirement,
    );
    const timer = setTimeout(() => {
      startTransition(async () => {
        const rows = await structuredSearchAction({ query, requirements, inStockOnly: false });
        setResults(rows);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, activeChips]);

  function toggle(item: SearchResultItem) {
    const exists = selected.find((p) => p.variantId === item.variantId);
    if (exists) {
      onChange(selected.filter((p) => p.variantId !== item.variantId));
    } else {
      onChange([
        ...selected,
        { variantId: item.variantId, productName: item.productName, variantName: item.variantName, quantity: 1 },
      ]);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((item) => (
            <Badge key={item.variantId} variant="secondary" className="gap-1.5">
              {item.variantName !== item.productName ? `${item.productName} — ${item.variantName}` : item.productName}
              <button
                type="button"
                onClick={() => onChange(selected.filter((p) => p.variantId !== item.variantId))}
                aria-label={`Remover ${item.productName}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Input
        placeholder="Buscar produtos por nome ou SKU…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        {QUICK_REQUIREMENTS.map((chip) => (
          <Toggle
            key={chip.label}
            size="sm"
            pressed={activeChips.includes(chip.label)}
            onPressedChange={(pressed) =>
              setActiveChips((current) =>
                pressed ? [...current, chip.label] : current.filter((c) => c !== chip.label),
              )
            }
          >
            {chip.label}
          </Toggle>
        ))}
      </div>

      <div className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-1">
        {loading && (
          <div className="flex items-center gap-2 px-3 py-2 text-small text-muted-foreground">
            <Spinner /> Buscando…
          </div>
        )}
        {!loading && results.length === 0 && (
          <p className="px-3 py-4 text-center text-small text-muted-foreground">Nenhum produto encontrado.</p>
        )}
        {results.map((item) => {
          const isSelected = selected.some((p) => p.variantId === item.variantId);
          return (
            <button
              type="button"
              key={item.variantId}
              onClick={() => toggle(item)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-secondary",
                isSelected && "bg-secondary",
              )}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body font-medium">
                  {item.variantName !== item.productName
                    ? `${item.productName} — ${item.variantName}`
                    : item.productName}
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
                  {item.currentPrice !== null && formatMoney(item.currentPrice)}
                  <span className={cn("rounded-full px-1.5 py-0.5", COMPATIBILITY_TONE[item.compatibilityStatus])}>
                    {COMPATIBILITY_LABEL[item.compatibilityStatus]}
                  </span>
                </span>
              </span>
              {isSelected && <Check className="size-4 shrink-0 text-brand-600" />}
            </button>
          );
        })}
      </div>
      <Button type="button" variant="ghost" size="sm" className="self-start" disabled>
        {selected.length} produto{selected.length === 1 ? "" : "s"} selecionado{selected.length === 1 ? "" : "s"}
      </Button>
    </div>
  );
}
