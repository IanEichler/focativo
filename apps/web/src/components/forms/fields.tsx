"use client";

import { useId } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface FieldShellProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

function FieldShell({ id, label, required, error, description, className, children }: FieldShellProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-body font-medium text-foreground">
        {label}
        {required && (
          <span aria-hidden="true" className="text-danger">
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-small text-danger">
          {error}
        </p>
      ) : (
        description && (
          <p id={`${id}-description`} className="text-small text-muted-foreground">
            {description}
          </p>
        )
      )}
    </div>
  );
}

function describedBy(id: string, error?: string, description?: React.ReactNode) {
  if (error) return `${id}-error`;
  return description ? `${id}-description` : undefined;
}

/** Número no padrão brasileiro (vírgula decimal), com prefixo/sufixo opcional. */
export function DecimalField({
  label,
  name,
  defaultValue,
  error,
  description,
  required,
  prefix,
  suffix,
  placeholder = "0,00",
  disabled,
  className,
  autoFocus,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  error?: string;
  description?: React.ReactNode;
  required?: boolean;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} required={required} error={error} description={description} className={className}>
      <InputGroup data-disabled={disabled || undefined}>
        {prefix && (
          <InputGroupAddon>
            <InputGroupText>{prefix}</InputGroupText>
          </InputGroupAddon>
        )}
        <InputGroupInput
          id={id}
          name={name}
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder}
          defaultValue={defaultValue}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          className="tabular"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, description)}
        />
        {suffix && (
          <InputGroupAddon align="inline-end">
            <InputGroupText>{suffix}</InputGroupText>
          </InputGroupAddon>
        )}
      </InputGroup>
    </FieldShell>
  );
}

export function TextareaField({
  label,
  name,
  defaultValue,
  error,
  description,
  required,
  rows = 3,
  maxLength,
  placeholder,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  error?: string;
  description?: React.ReactNode;
  required?: boolean;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} required={required} error={error} description={description} className={className}>
      <Textarea
        id={id}
        name={name}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, description)}
      />
    </FieldShell>
  );
}

/** Switch que envia "on" no formulário quando ligado. */
export function SwitchField({
  label,
  name,
  defaultChecked,
  description,
  disabled,
  className,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-start justify-between gap-4 rounded-lg border border-border p-3", className)}>
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="text-body font-medium text-foreground">
          {label}
        </Label>
        {description && (
          <p id={`${id}-description`} className="text-small text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <Switch
        id={id}
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        aria-describedby={description ? `${id}-description` : undefined}
      />
    </div>
  );
}
