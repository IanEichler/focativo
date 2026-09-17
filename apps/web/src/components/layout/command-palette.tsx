"use client";

import { Laptop, Moon, Search, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { NavIcon } from "./nav-icon";
import type { NavIconName } from "./nav-types";

export interface CommandPaletteItem {
  title: string;
  href: string;
  icon: NavIconName;
  group: string;
}

/**
 * Ctrl/⌘ + K. Nesta fase: navegação e preferências. A busca por entidades
 * (produto, cliente, venda, reserva) entra junto com cada módulo.
 */
export function CommandPalette({ items }: { items: CommandPaletteItem[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const groups = [...new Set(items.map((item) => item.group))];

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 w-9 justify-center px-0 text-muted-foreground sm:w-56 sm:justify-start sm:px-3"
        aria-label="Abrir paleta de comandos"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Ir para…</span>
        <Kbd className="ml-auto hidden sm:inline-flex">Ctrl K</Kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Paleta de comandos"
        description="Navegue rapidamente pela plataforma"
      >
        <CommandInput placeholder="Digite para buscar uma página ou ação…" />
        <CommandList>
          <CommandEmpty>Nenhum resultado.</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup key={group} heading={group}>
              {items
                .filter((item) => item.group === group)
                .map((item) => (
                  <CommandItem
                    key={item.href}
                    value={`${item.title} ${item.href}`}
                    onSelect={() => run(() => router.push(item.href))}
                  >
                    <NavIcon name={item.icon} className="size-4 text-muted-foreground" />
                    {item.title}
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading="Aparência">
            <CommandItem value="tema sistema" onSelect={() => run(() => setTheme("system"))}>
              <Laptop className="size-4 text-muted-foreground" /> Tema do sistema
            </CommandItem>
            <CommandItem value="tema claro" onSelect={() => run(() => setTheme("light"))}>
              <Sun className="size-4 text-muted-foreground" /> Tema claro
            </CommandItem>
            <CommandItem value="tema escuro" onSelect={() => run(() => setTheme("dark"))}>
              <Moon className="size-4 text-muted-foreground" /> Tema escuro
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
