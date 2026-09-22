"use client";

import { MoreHorizontal, ShieldCheck, UserMinus } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { adminRemoveTenantUserAction } from "../actions";
import { AdminMemberPermissionsSheet } from "./admin-member-permissions-sheet";

export function AdminMemberActions({
  membershipId,
  tenantId,
  memberName,
}: {
  membershipId: string;
  tenantId: string;
  memberName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  function remove() {
    startTransition(async () => {
      const result = await adminRemoveTenantUserAction(membershipId, tenantId);
      if (result.status === "error") toast.error(result.message ?? "Não foi possível remover.");
      else toast.success(result.message ?? "Usuário removido.");
      setConfirmRemove(false);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${memberName}`} disabled={pending}>
            {pending ? <Spinner /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setPermissionsOpen(true)}>
            <ShieldCheck /> Personalizar permissões
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmRemove(true)}>
            <UserMinus /> Remover da empresa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AdminMemberPermissionsSheet
        membershipId={membershipId}
        tenantId={tenantId}
        memberName={memberName}
        open={permissionsOpen}
        onOpenChange={setPermissionsOpen}
      />

      <AlertDialog open={confirmRemove} onOpenChange={(open) => !open && !pending && setConfirmRemove(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberName} perderá o acesso a esta empresa. O histórico de ações continua registrado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                remove();
              }}
            >
              {pending && <Spinner />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
