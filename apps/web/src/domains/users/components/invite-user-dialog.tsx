"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useCallback, useId, useState } from "react";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { TextField } from "@/components/forms/text-field";
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
import { inviteUserAction } from "../actions";
import type { InviteUserField } from "../schemas";

export interface RoleOption {
  code: string;
  name: string;
  description: string;
}

export function InviteUserDialog({ roles }: { roles: RoleOption[] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={roles.length === 0}>
          <UserPlus /> Convidar usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {/* Remonta o formulário a cada abertura para limpar o estado anterior. */}
        {open && <InviteUserForm roles={roles} onDone={close} />}
      </DialogContent>
    </Dialog>
  );
}

function InviteUserForm({ roles, onDone }: { roles: RoleOption[]; onDone: () => void }) {
  const [state, action] = useActionState<ActionState<InviteUserField>, FormData>(inviteUserAction, IDLE);
  const roleGroupId = useId();
  const values = state.status === "error" ? state.values : undefined;
  const roleError = fieldError(state, "roleCode");

  useActionFeedback(state, { onSuccess: onDone });

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>Convidar usuário</DialogTitle>
        <DialogDescription>A pessoa recebe acesso somente a esta empresa, com o papel escolhido.</DialogDescription>
      </DialogHeader>

      <FormMessage state={state.status === "error" ? state : IDLE} />

      <TextField
        label="E-mail"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="off"
        required
        autoFocus
        defaultValue={values?.email}
        error={fieldError(state, "email")}
      />

      <fieldset className="flex flex-col gap-2" aria-describedby={roleError ? `${roleGroupId}-error` : undefined}>
        <legend className="mb-1 text-body font-medium">Papel</legend>
        <RadioGroup name="roleCode" defaultValue={values?.roleCode ?? roles.at(-1)?.code} className="gap-2">
          {roles.map((role) => (
            <Label
              key={role.code}
              htmlFor={`${roleGroupId}-${role.code}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-brand-50/60 dark:has-[[data-state=checked]]:bg-brand-900/30"
            >
              <RadioGroupItem id={`${roleGroupId}-${role.code}`} value={role.code} className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="text-body font-medium">{role.name}</span>
                <span className="text-small text-muted-foreground">{role.description}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        {roleError && (
          <p id={`${roleGroupId}-error`} className="text-small text-danger">
            {roleError}
          </p>
        )}
      </fieldset>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancelar
          </Button>
        </DialogClose>
        <SubmitButton pendingLabel="Enviando…">Enviar convite</SubmitButton>
      </DialogFooter>
    </form>
  );
}
