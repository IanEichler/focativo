"use client";

import { Building2, LogOut, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useTheme } from "@/components/providers/theme-provider";
import { useTransition } from "react";
import { signOutAction } from "@/domains/auth/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";

interface UserMenuProps {
  name: string;
  email: string | null;
  isSuperAdmin: boolean;
  area: "app" | "admin";
}

export function UserMenu({ name, email, isSuperAdmin, area }: UserMenuProps) {
  const { theme, setTheme } = useTheme();
  const displayName = name || email || "Usuário";
  const [signingOut, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Menu do usuário"
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-brand-100 text-caption font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
            {initials(displayName)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-24px)] p-1.5">
        <DropdownMenuLabel className="flex items-center gap-3 px-1.5 py-2">
          <Avatar className="size-9 shrink-0">
            <AvatarFallback className="bg-brand-100 text-caption font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
              {initials(displayName)}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-body font-medium text-foreground">{displayName}</span>
            {email && <span className="truncate text-caption font-normal text-muted-foreground">{email}</span>}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className="flex flex-col gap-0.5">
          {area === "app" && (
            <DropdownMenuItem asChild className="px-1.5 py-2">
              <Link href="/app/configuracoes?aba=perfil">
                <UserRound /> Meu perfil
              </Link>
            </DropdownMenuItem>
          )}
          {isSuperAdmin && area === "app" && (
            <DropdownMenuItem asChild className="px-1.5 py-2">
              <Link href="/admin">
                <ShieldCheck /> Administração da plataforma
              </Link>
            </DropdownMenuItem>
          )}
          {area === "admin" && (
            <DropdownMenuItem asChild className="px-1.5 py-2">
              <Link href="/app/dashboard">
                <Building2 /> Voltar para a empresa
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="px-1.5 py-2">Tema</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={theme ?? "system"}
                onValueChange={(value) => {
                  if (value === "light" || value === "dark" || value === "system") setTheme(value);
                }}
              >
                <DropdownMenuRadioItem value="system">Sistema</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="light">Claro</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">Escuro</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={() => startTransition(() => signOutAction())}
          className="px-1.5 py-2 text-muted-foreground"
        >
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
