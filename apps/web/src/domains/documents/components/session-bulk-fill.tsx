"use client";

import { CalendarRange } from "lucide-react";
import { useState } from "react";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { SESSION_FREQUENCIES, sessionDates, type SessionFrequency } from "../session-dates";
import { eligibleProfessionals, type ContractSchedulingOptions } from "./session-schedule-fields";

export type SessionBulkPreset = {
  /** número da sessão → data AAAA-MM-DD */
  dates: Record<string, string>;
  serviceId: string;
  time: string;
  professionalId: string;
  /** Valores já digitados no formulário (região, observações…), para não se perderem ao remontar. */
  typed: Record<string, string>;
};

/**
 * Preenche data, horário, serviço e profissional de várias sessões de uma vez
 * (pacote de 10 sessões semanais, por exemplo). Ela ajusta alguma exceção depois.
 */
export function SessionBulkFill({
  sessionNumbers,
  services,
  professionals,
  onApply,
}: ContractSchedulingOptions & { sessionNumbers: string[]; onApply: (preset: SessionBulkPreset) => void }) {
  const [first, setFirst] = useState("");
  const [frequency, setFrequency] = useState<SessionFrequency>("7");
  const [count, setCount] = useState(String(sessionNumbers.length));
  const [time, setTime] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const eligible = eligibleProfessionals(services, professionals, serviceId);

  function apply(form: HTMLFormElement | null) {
    const total = Number(count);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) return setError("Informe a data da 1ª sessão.");
    if (!Number.isInteger(total) || total < 1 || total > sessionNumbers.length) {
      return setError(`Informe de 1 a ${sessionNumbers.length} sessões.`);
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return setError("Informe o horário.");
    if (!serviceId) return setError("Escolha o serviço.");
    if (!professionalId || !eligible.some((item) => item.userId === professionalId))
      return setError("Escolha o profissional.");
    setError(null);

    const typed: Record<string, string> = {};
    if (form) {
      for (const [name, value] of new FormData(form).entries()) {
        if (typeof value === "string" && /^field_sessao_\d+_/.test(name)) typed[name.slice("field_".length)] = value;
      }
    }
    const dates = sessionDates(first, frequency, total);
    onApply({
      dates: Object.fromEntries(sessionNumbers.slice(0, total).map((number, index) => [number, dates[index]!])),
      serviceId,
      time,
      professionalId,
      typed,
    });
  }

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-dashed border-border p-4">
      <legend className="flex items-center gap-2 px-1 font-medium">
        <CalendarRange className="size-4" /> Preencher sessões de uma vez
      </legend>
      <p className="text-small text-muted-foreground">
        Preenche data, horário, serviço e profissional das sessões abaixo. Depois dá para ajustar qualquer uma.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="1ª sessão"
          name="bulk_first"
          type="date"
          value={first}
          onChange={(event) => setFirst(event.target.value)}
        />
        <SelectField
          label="Frequência"
          name="bulk_frequency"
          defaultValue="7"
          options={SESSION_FREQUENCIES.map((item) => ({ value: item.value, label: item.label }))}
          onValueChange={(value) => setFrequency(value as SessionFrequency)}
        />
        <TextField
          label="Quantas sessões"
          name="bulk_count"
          inputMode="numeric"
          value={count}
          onChange={(event) => setCount(event.target.value)}
          description={`O modelo tem ${sessionNumbers.length}.`}
        />
        <TextField
          label="Horário"
          name="bulk_time"
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />
        <SelectField
          label="Serviço"
          name="bulk_service"
          options={services.map((item) => ({ value: item.id, label: `${item.name} · ${item.durationMinutes} min` }))}
          onValueChange={(value) => {
            setServiceId(value);
            setProfessionalId("");
          }}
        />
        <SelectField
          key={serviceId}
          label="Profissional"
          name="bulk_professional"
          options={eligible.map((item) => ({ value: item.userId, label: item.fullName }))}
          onValueChange={setProfessionalId}
        />
      </div>
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={(event) => apply(event.currentTarget.form)}
      >
        Preencher sessões
      </Button>
    </fieldset>
  );
}
