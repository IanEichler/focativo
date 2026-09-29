"use client";

import { useState } from "react";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";

const PAYMENT_OPTIONS = ["Pix", "Dinheiro", "Cartão de crédito", "Cartão de débito", "Boleto", "Transferência bancária"];
const OTHER = "__other__";

export function ContractPaymentField({ name, defaultValue = "" }: { name: string; defaultValue?: string }) {
  const initialOption = PAYMENT_OPTIONS.find((option) => option.toLocaleLowerCase("pt-BR") === defaultValue.trim().toLocaleLowerCase("pt-BR"));
  const [choice, setChoice] = useState(initialOption ?? (defaultValue ? OTHER : ""));
  const [custom, setCustom] = useState(initialOption ? "" : defaultValue);

  return <div className="flex flex-col gap-3">
    <input type="hidden" name={name} value={choice === OTHER ? custom : choice} />
    <SelectField
      label="Forma de pagamento"
      name={`payment_choice_${name}`}
      defaultValue={choice || undefined}
      onValueChange={setChoice}
      options={[
        ...PAYMENT_OPTIONS.map((option) => ({ value: option, label: option })),
        { value: OTHER, label: "Outra forma / combinação" },
      ]}
    />
    {choice === OTHER && <TextField
      label="Detalhes do pagamento"
      name={`payment_details_${name}`}
      placeholder="Ex.: entrada no Pix e saldo no cartão"
      value={custom}
      onChange={(event) => setCustom(event.target.value)}
      maxLength={2000}
    />}
  </div>;
}
