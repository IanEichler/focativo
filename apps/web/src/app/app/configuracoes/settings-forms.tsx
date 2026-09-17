"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useActionState } from "react";
import { useIsClient } from "@/hooks/use-is-client";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { SelectField } from "@/components/forms/select-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { TextField } from "@/components/forms/text-field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { updateProfileAction, type UpdateProfileField } from "@/domains/profile/actions";
import { updateTenantAction } from "@/domains/tenants/actions";
import { TENANT_SEGMENTS, TIMEZONES, type UpdateTenantField } from "@/domains/tenants/schemas";
import { formatCpfCnpj } from "@/lib/br-documents";
import { IDLE, type ActionState } from "@/lib/errors";
import { cn } from "@/lib/utils";

export interface TenantFormValues {
  name: string;
  legalName: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  segment: string;
  timezone: string;
}

const TIMEZONE_OPTIONS = TIMEZONES.map((zone) => ({
  value: zone,
  label: zone.replace("America/", "").replaceAll("_", " "),
}));

export function TenantSettingsForm({ initial, canEdit }: { initial: TenantFormValues; canEdit: boolean }) {
  const [state, action] = useActionState<ActionState<UpdateTenantField>, FormData>(updateTenantAction, IDLE);
  useActionFeedback(state);
  const values = state.status === "error" ? state.values : undefined;
  const pick = (field: UpdateTenantField, fallback: string | null) => values?.[field] ?? fallback ?? undefined;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {!canEdit && (
        <p className="rounded-lg bg-secondary px-3 py-2.5 text-body text-muted-foreground">
          Somente proprietários e administradores podem editar os dados da empresa.
        </p>
      )}
      <FormMessage state={state.status === "error" ? state : IDLE} />
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nome da empresa"
          name="name"
          required
          defaultValue={pick("name", initial.name)}
          error={fieldError(state, "name")}
          containerClassName="sm:col-span-2"
        />
        <TextField
          label="Razão social"
          name="legalName"
          defaultValue={pick("legalName", initial.legalName)}
          error={fieldError(state, "legalName")}
        />
        <TextField
          label="CPF ou CNPJ"
          name="document"
          inputMode="numeric"
          defaultValue={pick("document", initial.document ? formatCpfCnpj(initial.document) : null)}
          error={fieldError(state, "document")}
        />
        <TextField
          label="E-mail comercial"
          name="email"
          type="email"
          inputMode="email"
          defaultValue={pick("email", initial.email)}
          error={fieldError(state, "email")}
        />
        <TextField
          label="Telefone"
          name="phone"
          type="tel"
          inputMode="tel"
          placeholder="(11) 99999-9999"
          defaultValue={pick("phone", initial.phone)}
          error={fieldError(state, "phone")}
        />
        <SelectField
          label="Segmento"
          name="segment"
          options={TENANT_SEGMENTS}
          defaultValue={pick("segment", initial.segment)}
          error={fieldError(state, "segment")}
        />
        <SelectField
          label="Fuso horário"
          name="timezone"
          options={TIMEZONE_OPTIONS}
          defaultValue={pick("timezone", initial.timezone)}
          error={fieldError(state, "timezone")}
        />
      </fieldset>
      {canEdit && (
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Salvando…">Salvar alterações</SubmitButton>
        </div>
      )}
    </form>
  );
}

export function ProfileForm({
  initial,
}: {
  initial: { fullName: string; phone: string | null; email: string | null };
}) {
  const [state, action] = useActionState<ActionState<UpdateProfileField>, FormData>(updateProfileAction, IDLE);
  useActionFeedback(state);
  const values = state.status === "error" ? state.values : undefined;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state.status === "error" ? state : IDLE} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nome completo"
          name="fullName"
          required
          autoComplete="name"
          defaultValue={values?.fullName ?? initial.fullName}
          error={fieldError(state, "fullName")}
          containerClassName="sm:col-span-2"
        />
        <TextField
          label="E-mail"
          name="emailReadonly"
          value={initial.email ?? ""}
          readOnly
          disabled
          description="O e-mail de acesso não pode ser alterado por aqui."
        />
        <TextField
          label="Telefone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={values?.phone ?? initial.phone ?? undefined}
          error={fieldError(state, "phone")}
        />
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Salvando…">Salvar perfil</SubmitButton>
      </div>
    </form>
  );
}

const THEMES = [
  { value: "system", label: "Sistema", description: "Segue o dispositivo", icon: Laptop },
  { value: "light", label: "Claro", description: "Fundo claro", icon: Sun },
  { value: "dark", label: "Escuro", description: "Fundo escuro", icon: Moon },
] as const;

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  // Evita divergência de hidratação: o tema só é conhecido no cliente.
  const mounted = useIsClient();
  const current = mounted ? (theme ?? "system") : undefined;

  return (
    <RadioGroup
      value={current}
      onValueChange={setTheme}
      aria-label="Tema da interface"
      className="grid gap-3 sm:grid-cols-3"
    >
      {THEMES.map((option) => (
        <Label
          key={option.value}
          htmlFor={`theme-${option.value}`}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-4 font-normal transition-colors hover:bg-surface-hover",
            "has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-primary",
          )}
        >
          <RadioGroupItem id={`theme-${option.value}`} value={option.value} />
          <option.icon className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="flex flex-col">
            <span className="text-body font-medium">{option.label}</span>
            <span className="text-small text-muted-foreground">{option.description}</span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}
