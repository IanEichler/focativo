"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
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
  const isPassword = props.type === "password";
  const [revealed, setRevealed] = useState(false);

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-body font-medium text-foreground">
          {label}
          {props.required && (
            <span aria-hidden="true" className="text-danger">
              *
            </span>
          )}
        </Label>
        {labelAction}
      </div>
      <div className="relative">
        <Input
          id={id}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={[descriptionId, errorId].filter(Boolean).join(" ") || undefined}
          className={cn(isPassword && "pr-9", className)}
          {...props}
          type={isPassword ? (revealed ? "text" : "password") : props.type}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            aria-label={revealed ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={revealed}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground outline-none hover:text-foreground focus-visible:rounded-sm focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
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
