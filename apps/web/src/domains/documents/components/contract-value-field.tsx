"use client";

import { useState } from "react";
import { TextField } from "@/components/forms/text-field";
import { contractFieldError, contractFieldKind, formatContractField, maskContractDate } from "../field-format";

export function ContractValueField({ field, label, defaultValue = "", onValueChange }: {
  field: string;
  label: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  const kind = contractFieldKind(field);
  const [value, setValue] = useState(() => formatContractField(field, defaultValue));
  const [touched, setTouched] = useState(false);
  const error = contractFieldError(field, value);
  return <TextField
    label={kind === "money" ? `${label} (R$)` : label}
    name={`field_${field}`}
    value={value}
    inputMode={kind === "money" ? "decimal" : "numeric"}
    type={kind === "integer" ? "number" : "text"}
    min={kind === "integer" ? 1 : undefined}
    step={kind === "integer" ? 1 : undefined}
    placeholder={kind === "date" ? "DD/MM/AAAA" : kind === "money" ? "0,00" : "1"}
    maxLength={kind === "date" ? 10 : undefined}
    error={touched ? error : undefined}
    onChange={(event) => {
      const next = kind === "date" ? maskContractDate(event.target.value) : event.target.value;
      setValue(next);
      event.target.setCustomValidity(contractFieldError(field, next) ?? "");
      onValueChange?.(next);
    }}
    onBlur={(event) => {
      setTouched(true);
      const next = formatContractField(field, value);
      setValue(next);
      event.target.setCustomValidity(contractFieldError(field, next) ?? "");
      onValueChange?.(next);
    }}
  />;
}
