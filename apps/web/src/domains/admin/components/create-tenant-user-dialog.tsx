"use client";

import { RefreshCw, UserPlus2 } from "lucide-react";
import { useActionState, useCallback, useState } from "react";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { IDLE, type ActionState } from "@/lib/errors";
import { adminCreateTenantUserAction } from "../actions";
import type { AdminCreateTenantUserField } from "../schemas";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function suggestPassword(length = 12): string {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => CHARSET[v % CHARSET.length]).join("");
}

export function CreateTenantUserDialog({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus2 /> Criar usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {open && <CreateTenantUserForm tenantId={tenantId} onDone={close} />}
      </DialogContent>
    </Dialog>
  );
}

function CreateTenantUserForm({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState<AdminCreateTenantUserField>, FormData>(
    adminCreateTenantUserAction,
    IDLE,
  );
  const [password, setPassword] = useState(() => suggestPassword());
  const values = state.status === "error" ? state.values : undefined;

  useActionFeedback(state, { onSuccess: onDone });

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="tenantId" value={tenantId} />
      <DialogHeader>
        <DialogTitle>Criar usuário nesta empresa</DialogTitle>
        <DialogDescription>
          A conta já nasce com a senha abaixo — repasse-a por um canal seguro. Você não precisa fazer parte da empresa
          pra criar o acesso.
        </DialogDescription>
      </DialogHeader>

      <FormMessage state={state.status === "error" ? state : IDLE} />

      <TextField
        label="Nome completo"
        name="fullName"
        required
        autoFocus
        defaultValue={values?.fullName}
        error={fieldError(state, "fullName")}
      />
      <TextField
        label="E-mail"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="off"
        required
        defaultValue={values?.email}
        error={fieldError(state, "email")}
      />
      <div className="flex items-end gap-2">
        <TextField
          label="Senha"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="font-mono"
          autoComplete="off"
          containerClassName="flex-1"
          error={fieldError(state, "password")}
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => setPassword(suggestPassword())}
          aria-label="Gerar outra sugestão"
        >
          <RefreshCw />
        </Button>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-body font-medium">Perfil</legend>
        <RadioGroup name="roleCode" defaultValue={values?.roleCode ?? "VENDEDOR"} className="gap-2">
          <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-brand-50/60 dark:has-[[data-state=checked]]:bg-brand-900/30">
            <RadioGroupItem value="ADMIN" className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="text-body font-medium">Administrador</span>
              <span className="text-small text-muted-foreground">Administração operacional da empresa.</span>
            </span>
          </Label>
          <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-brand-50/60 dark:has-[[data-state=checked]]:bg-brand-900/30">
            <RadioGroupItem value="VENDEDOR" className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="text-body font-medium">Funcionário</span>
              <span className="text-small text-muted-foreground">
                Atendimento, clientes e o dia a dia da operação. Dá pra ajustar as permissões depois.
              </span>
            </span>
          </Label>
        </RadioGroup>
      </fieldset>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancelar
          </Button>
        </DialogClose>
        <SubmitButton pendingLabel="Criando…">Criar usuário</SubmitButton>
      </DialogFooter>
    </form>
  );
}
