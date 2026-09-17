"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface TextFieldProps extends Omit<React.ComponentProps<typeof Input>, "id"> {
  label: string;
  name: string;
  error?: string;
  description?: React.ReactNode;
  labelAction?: React.ReactNode;
  containerClassName?: string;
}

/** Label + input + descrição + erro, com ids e aria corretamente ligados. */
export function TextField({
  label,
  name,
  error,
  description,
  labelAction,
  containerClassName,
  className,
  ...props
}: TextFieldProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-body font-medium">
          {label}
          {props.required && (
            <span aria-hidden="true" className="text-danger">
              *
            </span>
          )}
        </Label>
        {labelAction}
      </div>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={[descriptionId, errorId].filter(Boolean).join(" ") || undefined}
        className={className}
        {...props}
      />
      {description && !error && (
        <p id={descriptionId} className="text-small text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-small text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
