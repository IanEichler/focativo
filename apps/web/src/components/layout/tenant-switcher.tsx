"use client";

import { Check } from "lucide-react";
import { useTransition } from "react";
import { switchTenantAction } from "@/domains/tenants/actions";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TenantOption {
  id: string;
  name: string;
  roleName: string;
}

export function TenantSwitcher({ current, options }: { current: TenantOption; options: TenantOption[] }) {
  const [pending, startTransition] = useTransition();

  const switchTo = (tenantId: string) => {
    const formData = new FormData();
    formData.set("tenantId", tenantId);
    startTransition(() => switchTenantAction(formData));
  };

  return (
    <DropdownMenuGroup aria-label="Empresas" aria-busy={pending}>
      <DropdownMenuLabel className="text-caption text-muted-foreground">{options.length > 1 ? "Suas empresas" : "Empresa atual"}</DropdownMenuLabel>
      {options.map((option) => (
        <DropdownMenuItem
          key={option.id}
          disabled={pending || option.id === current.id}
          className={cn("gap-2.5 py-2", option.id === current.id && "data-disabled:opacity-100")}
          aria-label={`${option.name}, ${option.roleName}${option.id === current.id ? ", empresa atual" : ""}`}
          onSelect={() => switchTo(option.id)}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-caption font-semibold">
            {initials(option.name)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col text-left">
            <span className="whitespace-normal break-words font-medium">{option.name}</span>
            <span className="truncate text-caption text-muted-foreground">{option.roleName}</span>
          </span>
          {option.id === current.id && <Check className="size-4 text-primary" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuGroup>
  );
}
