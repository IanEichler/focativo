"use client";

import { useState } from "react";
import { TextField } from "./text-field";

type MaskedTextFieldProps = Omit<React.ComponentProps<typeof TextField>, "defaultValue" | "value" | "onChange"> & {
  mask: (raw: string) => string;
  defaultValue?: string | null;
};

/** Aplica a máscara a cada tecla, sempre recalculando a partir dos dígitos crus (nunca do texto já formatado). */
export function MaskedTextField({ mask, defaultValue, ...props }: MaskedTextFieldProps) {
  const [value, setValue] = useState(() => mask(defaultValue ?? ""));

  return <TextField {...props} value={value} onChange={(event) => setValue(mask(event.target.value))} />;
}
