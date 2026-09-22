"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { TENANT_MODULES } from "@/lib/modules";
import { setModuleFlagAction } from "../actions";

export function ModuleFlagsCard({ tenantId, disabledModules }: { tenantId: string; disabledModules: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [disabled, setDisabled] = useState(new Set(disabledModules));

  function toggle(moduleCode: string, enabled: boolean) {
    const next = new Set(disabled);
    if (enabled) next.delete(moduleCode);
    else next.add(moduleCode);
    setDisabled(next);

    startTransition(async () => {
      const result = await setModuleFlagAction({ tenantId, moduleCode, enabled });
      if (result.status === "error") setDisabled(new Set(disabled));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Módulos</CardTitle>
        <CardDescription>Recursos do plano habilitados para esta empresa.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-border">
          {TENANT_MODULES.map((module) => {
            const enabled = !disabled.has(module.code);
            return (
              <li key={module.code} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <Label htmlFor={`module-${module.code}`} className="text-body font-medium">
                  {module.label}
                </Label>
                <Switch
                  id={`module-${module.code}`}
                  checked={enabled}
                  disabled={pending}
                  onCheckedChange={(checked) => toggle(module.code, checked)}
                />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
