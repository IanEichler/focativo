"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { switchTenantAction } from "@/domains/tenants/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useShell } from "./shell-context";

export interface TenantOption {
  id: string;
  name: string;
  roleName: string;
}

export function TenantSwitcher({ current, options }: { current: TenantOption; options: TenantOption[] }) {
  const { collapsed } = useShell();
  const [pending, startTransition] = useTransition();

  const switchTo = (tenantId: string) => {
    const formData = new FormData();
    formData.set("tenantId", tenantId);
    startTransition(() => switchTenantAction(formData));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          collapsed && "justify-center",
        )}
        aria-label={`Empresa atual: ${current.name}. Trocar empresa`}
        aria-busy={pending}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-caption font-semibold text-foreground">
          {initials(current.name)}
        </span>
        {!collapsed && (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body font-medium">{current.name}</span>
              <span className="truncate text-caption text-muted-foreground">{current.roleName}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? "right" : "top"} align="start" className="w-64">
        <DropdownMenuLabel className="text-caption text-muted-foreground">Suas empresas</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.id}
            disabled={pending || option.id === current.id}
            onSelect={() => switchTo(option.id)}
          >
            <span className="flex size-6 items-center justify-center rounded-md bg-secondary text-[10px] font-semibold">
              {initials(option.name)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col text-left">
              <span className="truncate">{option.name}</span>
              <span className="truncate text-caption text-muted-foreground">{option.roleName}</span>
            </span>
            {option.id === current.id && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding?nova=1">
            <Plus /> Criar nova empresa
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
