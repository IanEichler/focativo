"use client";

import { Building2 } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TENANT_SEGMENTS } from "@/domains/tenants/schemas";
import { IDLE, type ActionState } from "@/lib/errors";
import { createTenantAction } from "../actions";
import type { CreateTenantField } from "../schemas";

export function CreateTenantDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Building2 /> Nova empresa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">{open && <CreateTenantForm />}</DialogContent>
    </Dialog>
  );
}

function CreateTenantForm() {
  const [state, action] = useActionState<ActionState<CreateTenantField>, FormData>(createTenantAction, IDLE);
  const values = state.status === "error" ? state.values : undefined;
  const segmentId = useId();
  const segmentError = fieldError(state, "segment");

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>Nova empresa</DialogTitle>
        <DialogDescription>
          Cria a empresa e já designa o proprietário. Se o e-mail ainda não tiver conta, um convite é enviado.
        </DialogDescription>
      </DialogHeader>
      <FormMessage state={state.status === "error" ? state : IDLE} />
      <TextField
        label="Nome da empresa"
        name="name"
        required
        defaultValue={values?.name}
        error={fieldError(state, "name")}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={segmentId} className="text-body font-medium">
          Segmento
        </Label>
        <Select name="segment" defaultValue={values?.segment ?? "general"}>
          <SelectTrigger id={segmentId} className="w-full" aria-invalid={segmentError ? true : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Varejo (com estoque)</SelectLabel>
              {TENANT_SEGMENTS.filter((s) => s.businessType === "RETAIL").map((segment) => (
                <SelectItem key={segment.value} value={segment.value}>
                  {segment.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Prestação de serviço (com agenda)</SelectLabel>
              {TENANT_SEGMENTS.filter((s) => s.businessType === "SERVICES").map((segment) => (
                <SelectItem key={segment.value} value={segment.value}>
                  {segment.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {segmentError && <p className="text-small text-danger">{segmentError}</p>}
      </div>
      <TextField
        label="E-mail do proprietário"
        name="ownerEmail"
        type="email"
        required
        defaultValue={values?.ownerEmail}
        error={fieldError(state, "ownerEmail")}
      />
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancelar
          </Button>
        </DialogClose>
        <SubmitButton pendingLabel="Criando…">Criar empresa</SubmitButton>
      </DialogFooter>
    </form>
  );
}
