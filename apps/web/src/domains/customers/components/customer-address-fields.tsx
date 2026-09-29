"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TextField } from "@/components/forms/text-field";
import { maskPostalCode } from "@/lib/masks";

type AddressValues = { postal_code?: string; address?: string; city_state?: string };
type AddressNames = Record<keyof AddressValues, string[]>;
const defaultNames: AddressNames = { postal_code: ["postal_code"], address: ["address"], city_state: ["city_state"] };
type LookupStatus = "idle" | "loading" | "found" | "partial" | "not-found" | "error";

const messages: Record<LookupStatus, string> = {
  idle: "Digite o CEP para preencher o endereço automaticamente.",
  loading: "Buscando endereço…",
  found: "Endereço encontrado. Confira e acrescente o número e o complemento.",
  partial: "Cidade encontrada. Complete a rua, o bairro e o número abaixo.",
  "not-found": "CEP não encontrado. Confira o número ou preencha o endereço manualmente.",
  error: "Não foi possível buscar o CEP. Tente novamente ou preencha o endereço manualmente.",
};

export function CustomerAddressFields({
  initialValues,
  errors,
  names = defaultNames,
}: {
  initialValues: AddressValues;
  errors: AddressValues;
  names?: AddressNames;
}) {
  const [postalCode, setPostalCode] = useState(() => maskPostalCode(initialValues.postal_code ?? ""));
  const [address, setAddress] = useState(initialValues.address ?? "");
  const [cityState, setCityState] = useState(initialValues.city_state ?? "");
  const [status, setStatus] = useState<LookupStatus>("idle");
  const [attempt, setAttempt] = useState(0);
  const editedPostalCode = useRef(false);
  const current = useRef({ address, cityState, addressRevision: 0, cityRevision: 0 });

  useEffect(() => {
    const digits = postalCode.replace(/\D/g, "");
    if (digits.length !== 8) return;
    // Opening an existing profile must preserve its number and complement.
    const fillOnlyEmpty = !editedPostalCode.current;
    const before = { ...current.current };
    if (fillOnlyEmpty && before.address.trim() && before.cityState.trim()) return;

    const controller = new AbortController();
    let active = true;
    const debounce = setTimeout(async () => {
      setStatus("loading");
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
          signal: controller.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        if (!response.ok) throw new Error("Postal code lookup failed");
        const data = await response.json();
        if (!active) return;
        if (data.erro) {
          setStatus("not-found");
          return;
        }
        if (typeof data.localidade !== "string" || !data.localidade.trim() || !/^[A-Z]{2}$/.test(data.uf)) {
          throw new Error("Invalid postal address");
        }
        const street = [data.logradouro, data.bairro]
          .filter((part): part is string => typeof part === "string" && !!part.trim())
          .join(", ");
        const city = `${data.localidade} / ${data.uf}`;
        // Preserve manual changes made while the lookup was in flight.
        if (street && current.current.addressRevision === before.addressRevision && (!fillOnlyEmpty || !before.address.trim())) {
          current.current.address = street;
          setAddress(street);
        }
        if (current.current.cityRevision === before.cityRevision && (!fillOnlyEmpty || !before.cityState.trim())) {
          current.current.cityState = city;
          setCityState(city);
        }
        setStatus(data.logradouro ? "found" : "partial");
      } catch {
        if (active) setStatus("error");
      } finally {
        clearTimeout(timeout);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(debounce);
      controller.abort();
    };
  }, [postalCode, attempt]);

  return (
    <>
      {names.postal_code.length > 0 && <TextField
        label="CEP"
        name={names.postal_code[0]!}
        inputMode="numeric"
        autoComplete="postal-code"
        placeholder="00000-000"
        value={postalCode}
        error={errors.postal_code}
        onChange={(event) => {
          editedPostalCode.current = true;
          setPostalCode(maskPostalCode(event.target.value));
          setStatus("idle");
        }}
        labelAction={status === "error" ? (
          <button type="button" className="text-small underline underline-offset-4" onClick={() => setAttempt((value) => value + 1)}>
            Tentar novamente
          </button>
        ) : undefined}
        description={
          <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5">
            {status === "loading" && <LoaderCircle aria-hidden="true" className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />}
            {messages[status]}
          </span>
        }
      />}
      {names.address.length > 0 && <TextField
        label="Endereço"
        name={names.address[0]!}
        autoComplete="street-address"
        placeholder="Rua, bairro, número e complemento"
        maxLength={500}
        value={address}
        error={errors.address}
        onChange={(event) => {
          current.current.addressRevision += 1;
          current.current.address = event.target.value;
          setAddress(event.target.value);
        }}
      />}
      {names.city_state.length > 0 && <TextField
        label="Cidade / UF"
        name={names.city_state[0]!}
        placeholder="Cidade / UF"
        maxLength={160}
        value={cityState}
        error={errors.city_state}
        onChange={(event) => {
          current.current.cityRevision += 1;
          current.current.cityState = event.target.value;
          setCityState(event.target.value);
        }}
      />}
      {names.postal_code.slice(1).map((name) => <input key={name} type="hidden" name={name} value={postalCode} />)}
      {names.address.slice(1).map((name) => <input key={name} type="hidden" name={name} value={address} />)}
      {names.city_state.slice(1).map((name) => <input key={name} type="hidden" name={name} value={cityState} />)}
    </>
  );
}
