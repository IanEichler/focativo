"use client";

import { MoreHorizontal, UserCheck, UserMinus, UserX } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { ActionState } from "@/lib/errors";
import { changeMemberRoleAction, removeMemberAction, setMemberActiveAction } from "../actions";
import type { RoleOption } from "./invite-user-dialog";

function notify(result: ActionState) {
  if (result.status === "success") toast.success(result.message ?? "Alteração salva.");
  else if (result.status === "error") toast.error(result.message);
}

function toFormData(entries: Record<string, string>) {
  const formData = new FormData();
  Object.entries(entries).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

export function MemberRoleSelect({
  membershipId,
  memberName,
  currentRole,
  currentRoleName,
  roles,
}: {
  membershipId: string;
  memberName: string;
  currentRole: string;
  currentRoleName: string;
  roles: RoleOption[];
}) {
  const [pending, startTransition] = useTransition();
  const options = roles.some((role) => role.code === currentRole)
    ? roles
    : [{ code: currentRole, name: currentRoleName, description: "" }, ...roles];

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentRole}
        disabled={pending}
        onValueChange={(roleCode) =>
          startTransition(async () => {
            notify(await changeMemberRoleAction({ status: "idle" }, toFormData({ membershipId, roleCode })));
          })
        }
      >
        <SelectTrigger size="sm" className="w-40" aria-label={`Papel de ${memberName}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((role) => (
            <SelectItem key={role.code} value={role.code}>
              {role.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <Spinner className="text-muted-foreground" />}
    </div>
  );
}

type PendingConfirmation = "disable" | "remove" | null;

export function MemberActions({
  membershipId,
  memberName,
  status,
}: {
  membershipId: string;
  memberName: string;
  status: "ACTIVE" | "INVITED" | "DISABLED";
}) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<PendingConfirmation>(null);

  const run = (action: () => Promise<ActionState>) =>
    startTransition(async () => {
      notify(await action());
      setConfirm(null);
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${memberName}`} disabled={pending}>
            {pending ? <Spinner /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {status === "DISABLED" ? (
            <DropdownMenuItem
              onSelect={() =>
                run(() => setMemberActiveAction({ status: "idle" }, toFormData({ membershipId, active: "true" })))
              }
            >
              <UserCheck /> Reativar acesso
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirm("disable")}>
              <UserX /> Desativar acesso
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("remove")}>
            <UserMinus /> Remover da empresa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && !pending && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "remove" ? "Remover da empresa?" : "Desativar acesso?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "remove"
                ? `${memberName} perderá o acesso a esta empresa. O histórico de ações continua registrado.`
                : `${memberName} não conseguirá acessar esta empresa até ser reativado.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                run(() =>
                  confirm === "remove"
                    ? removeMemberAction({ status: "idle" }, toFormData({ membershipId }))
                    : setMemberActiveAction({ status: "idle" }, toFormData({ membershipId, active: "false" })),
                );
              }}
            >
              {pending && <Spinner />}
              {confirm === "remove" ? "Remover" : "Desativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
