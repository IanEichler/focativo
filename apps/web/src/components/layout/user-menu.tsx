"use client";

import { Building2, LogOut, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
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
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="truncate text-body font-medium text-foreground">{displayName}</span>
          {email && <span className="truncate text-caption font-normal text-muted-foreground">{email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {area === "app" && (
            <DropdownMenuItem asChild>
              <Link href="/app/configuracoes?aba=perfil">
                <UserRound /> Meu perfil
              </Link>
            </DropdownMenuItem>
          )}
          {isSuperAdmin && area === "app" && (
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <ShieldCheck /> Administração da plataforma
              </Link>
            </DropdownMenuItem>
          )}
          {area === "admin" && (
            <DropdownMenuItem asChild>
              <Link href="/app/dashboard">
                <Building2 /> Voltar para a empresa
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Tema</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="system">Sistema</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="light">Claro</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">Escuro</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onSelect={() => startTransition(() => signOutAction())}>
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
