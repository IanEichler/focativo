"use client";

import { useActionState, useId, useState } from "react";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { SelectField } from "@/components/forms/select-field";
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
import { Textarea } from "@/components/ui/textarea";
import { IDLE, type ActionState } from "@/lib/errors";
import { setTenantStatusAction, type SetTenantStatusField } from "../actions";
import { TENANT_STATUS_LABEL } from "../labels";

export function TenantStatusDialog({
  tenantId,
  tenantName,
  status,
}: {
  tenantId: string;
  tenantName: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Alterar status</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {open && (
          <StatusForm tenantId={tenantId} tenantName={tenantName} status={status} onDone={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusForm({
  tenantId,
  tenantName,
  status,
  onDone,
}: {
  tenantId: string;
  tenantName: string;
  status: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState<SetTenantStatusField>, FormData>(setTenantStatusAction, IDLE);
  const reasonId = useId();
  const values = state.status === "error" ? state.values : undefined;
  const reasonError = fieldError(state, "reason");

  useActionFeedback(state, { onSuccess: onDone });

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>Alterar status</DialogTitle>
        <DialogDescription>
          {tenantName}. Suspensão deixa a empresa em modo somente leitura; cancelamento remove o acesso. A alteração é
          auditada.
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="tenantId" value={tenantId} />
      <FormMessage state={state.status === "error" ? state : IDLE} />
      <SelectField
        label="Novo status"
        name="status"
        required
        defaultValue={values?.status ?? status}
        options={Object.entries(TENANT_STATUS_LABEL).map(([value, meta]) => ({ value, label: meta.label }))}
        error={fieldError(state, "status")}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={reasonId} className="text-body font-medium">
          Motivo
          <span aria-hidden="true" className="text-danger">
            *
          </span>
        </Label>
        <Textarea
          id={reasonId}
          name="reason"
          required
          rows={3}
          maxLength={1000}
          defaultValue={values?.reason}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? `${reasonId}-error` : undefined}
          placeholder="Ex.: inadimplência confirmada após 3 tentativas de contato"
        />
        {reasonError && (
          <p id={`${reasonId}-error`} className="text-small text-danger">
            {reasonError}
          </p>
        )}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancelar
          </Button>
        </DialogClose>
        <SubmitButton pendingLabel="Salvando…">Confirmar</SubmitButton>
      </DialogFooter>
    </form>
  );
}
