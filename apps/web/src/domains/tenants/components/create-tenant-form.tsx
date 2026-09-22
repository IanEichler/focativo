"use client";

import { useActionState, useId } from "react";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { TextField } from "@/components/forms/text-field";
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
import { IDLE, type ActionState } from "@/lib/errors";
import { createTenantAction } from "../actions";
import { TENANT_SEGMENTS, type CreateTenantField } from "../schemas";

export function CreateTenantForm() {
  const [state, action] = useActionState<ActionState<CreateTenantField>, FormData>(createTenantAction, IDLE);
  const segmentId = useId();
  const values = state.status === "error" ? state.values : undefined;
  const segmentError = fieldError(state, "segment");

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Nome da empresa"
        name="name"
        required
        autoFocus
        placeholder="Ex.: Gorila Suplementos"
        autoComplete="organization"
        defaultValue={values?.name}
        error={fieldError(state, "name")}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={segmentId} className="text-body font-medium">
          Segmento
        </Label>
        <Select name="segment" defaultValue={values?.segment ?? "supplements"}>
          <SelectTrigger
            id={segmentId}
            className="w-full"
            aria-invalid={segmentError ? true : undefined}
            aria-describedby={segmentError ? `${segmentId}-error` : `${segmentId}-hint`}
          >
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
        {segmentError ? (
          <p id={`${segmentId}-error`} className="text-small text-danger">
            {segmentError}
          </p>
        ) : (
          <p id={`${segmentId}-hint`} className="text-small text-muted-foreground">
            Varejo libera catálogo, estoque, reservas e vendas; serviços libera a Agenda. Dá pra ajustar depois.
          </p>
        )}
      </div>
      <SubmitButton className="mt-1 w-full" size="lg" pendingLabel="Criando empresa…">
        Criar empresa
      </SubmitButton>
    </form>
  );
}
