"use client";

import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface SelectFieldProps {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
  error?: string;
  description?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  onValueChange?: (value: string) => void;
}

export function SelectField({
  label,
  name,
  options,
  defaultValue,
  error,
  description,
  disabled,
  required,
  className,
  onValueChange,
}: SelectFieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : description ? `${id}-description` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-body font-medium">
        {label}
        {required && (
          <span aria-hidden="true" className="text-danger">
            *
          </span>
        )}
      </Label>
      <Select
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        required={required}
        onValueChange={onValueChange}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        >
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
