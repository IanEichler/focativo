"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { buildHref } from "@/lib/url";
import { cn } from "@/lib/utils";

function useUpdateParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (patch: Record<string, string | undefined>) => {
    // Qualquer filtro novo volta para a primeira página.
    const href = buildHref(pathname, new URLSearchParams(searchParams.toString()), { ...patch, page: undefined });
    startTransition(() => router.replace(href, { scroll: false }));
  };

  return { update, pending, searchParams };
}

/** Busca com debounce refletida em `?{param}=`. */
export function SearchInput({
  param = "q",
  placeholder = "Buscar…",
  label = "Buscar",
  className,
}: {
  param?: string;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  const { update, pending, searchParams } = useUpdateParams();
  const initial = searchParams.get(param) ?? "";
  const [value, setValue] = useState(initial);
  const lastApplied = useRef(initial);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === lastApplied.current) return;
    const timer = setTimeout(() => {
      lastApplied.current = trimmed;
      update({ [param]: trimmed || undefined });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- update muda a cada render; o debounce depende só do valor.
  }, [value, param]);

  return (
    <InputGroup className={cn("w-full sm:w-72", className)}>
      <InputGroupAddon>{pending ? <Spinner /> : <Search />}</InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Limpar busca" onClick={() => setValue("")}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

const ALL = "__all__";

export function FilterSelect({
  param,
  label,
  options,
  allLabel = "Todos",
  className,
}: {
  param: string;
  label: string;
  options: FilterOption[];
  allLabel?: string;
  className?: string;
}) {
  const { update, searchParams } = useUpdateParams();
  const current = searchParams.get(param) ?? ALL;

  return (
    <Select value={current} onValueChange={(value) => update({ [param]: value === ALL ? undefined : value })}>
      <SelectTrigger aria-label={label} className={cn("w-full sm:w-44", className)}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", className)}>{children}</div>
  );
}
