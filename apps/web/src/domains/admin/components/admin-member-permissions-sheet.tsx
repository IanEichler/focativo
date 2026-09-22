"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import type { MemberPermissionDTO } from "@/domains/users/queries";
import { PERMISSION_GROUPS, PERMISSION_LABELS, type Permission } from "@/lib/permissions";
import { getAdminMemberPermissionsAction, adminSetMemberPermissionsAction } from "../actions";

export function AdminMemberPermissionsSheet({
  membershipId,
  tenantId,
  memberName,
  open,
  onOpenChange,
}: {
  membershipId: string;
  tenantId: string;
  memberName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle className="text-section">Permissões de {memberName}</SheetTitle>
          <SheetDescription>
            Ligue ou desligue permissões específicas. O que não for tocado continua seguindo o papel do usuário.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <AdminMemberPermissionsForm
            membershipId={membershipId}
            tenantId={tenantId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function AdminMemberPermissionsForm({
  membershipId,
  tenantId,
  onDone,
}: {
  membershipId: string;
  tenantId: string;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissions, setPermissions] = useState<Map<string, MemberPermissionDTO>>(new Map());
  const [checked, setChecked] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    let active = true;
    getAdminMemberPermissionsAction(membershipId).then((result) => {
      if (!active) return;
      if (result.status === "error") {
        toast.error(result.message);
        setLoading(false);
        return;
      }
      setPermissions(new Map(result.permissions.map((p) => [p.code, p])));
      setChecked(new Map(result.permissions.map((p) => [p.code, p.granted])));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [membershipId]);

  function toggle(code: string, value: boolean) {
    setChecked((current) => new Map(current).set(code, value));
  }

  async function save() {
    setSaving(true);
    const overrides = [...checked.entries()]
      .filter(([code, value]) => value !== permissions.get(code)?.roleDefault)
      .map(([code, granted]) => ({ code: code as Permission, granted }));

    const result = await adminSetMemberPermissionsAction({ membershipId, overrides, tenantId });
    setSaving(false);
    if (result.status === "error") {
      toast.error(result.message ?? "Não foi possível salvar.");
      return;
    }
    toast.success(result.message ?? "Permissões atualizadas.");
    onDone();
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-6">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.module} className="flex flex-col gap-2">
              <span className="text-small font-semibold tracking-wide text-muted-foreground uppercase">
                {group.label}
              </span>
              <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                {group.permissions.map((code) => {
                  const isChecked = checked.get(code) ?? false;
                  const isCustom = permissions.get(code)?.roleDefault !== isChecked;
                  return (
                    <label key={code} className="flex items-center gap-2 text-body">
                      <Checkbox checked={isChecked} onCheckedChange={(value) => toggle(code, value === true)} />
                      <span className="flex-1">{PERMISSION_LABELS[code]}</span>
                      {isCustom && <span className="text-small text-muted-foreground">personalizado</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
        <Button type="button" variant="ghost" onClick={onDone} disabled={saving}>
          Cancelar
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving && <Spinner />}
          Salvar permissões
        </Button>
      </div>
    </>
  );
}
