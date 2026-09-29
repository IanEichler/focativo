"use client";

import { searchUrl, useSearchResults } from "@/components/data/use-search-results";
import { Check, ChevronsUpDown } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { CustomerOption } from "../queries";

export function CustomerPicker({
  value,
  onChange,
  error,
}: {
  value: CustomerOption | null;
  onChange: (option: CustomerOption) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const labelId = useId();
  const {
    items: options,
    loading,
    error: searchError,
  } = useSearchResults<CustomerOption>(searchUrl("customers", query), open, query ? 180 : 0);

  return (
    <div className="flex flex-col gap-1.5">
      <Label id={labelId} className="text-body font-medium">
        Cliente
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
            aria-labelledby={labelId}
            className="h-auto min-h-9 justify-between py-2 text-left font-normal"
          >
            {value ? (
              <span className="truncate">{value.name}</span>
            ) : (
              <span className="text-muted-foreground">Buscar cliente…</span>
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
              {!loading && <CommandEmpty>{searchError ?? "Nenhum cliente encontrado."}</CommandEmpty>}
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.id}
                    onSelect={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("size-4", value?.id === option.id ? "opacity-100" : "opacity-0")} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{option.name}</span>
                      <span className="text-caption text-muted-foreground">
                        {option.whatsapp ?? option.phone ?? "—"}
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
