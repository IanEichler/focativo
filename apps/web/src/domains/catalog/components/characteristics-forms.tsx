"use client";

import { ChevronDown, Info, Trash2 } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { DecimalField, TextareaField } from "@/components/forms/fields";
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toDecimalInput } from "@/lib/decimal";
import { IDLE, type ActionState } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  removeNutritionAction,
  saveAllergensAction,
  saveAttributeValuesAction,
  saveNutritionAction,
} from "../actions/characteristics";
import { formatAmount } from "../characteristics";
import { INFO_SOURCE_LABEL, INFO_SOURCES } from "../labels";
import type { AttributeDefinition, AttributeValue, CharacteristicsScopeData, NutritionValue } from "../queries";

const NONE = "__none__";

interface ScopeProps {
  productId: string;
  variantId: string | null;
  data: CharacteristicsScopeData;
}

function ScopeInputs({ productId, variantId }: { productId: string; variantId: string | null }) {
  return (
    <>
      <input type="hidden" name="productId" value={productId} />
      {variantId && <input type="hidden" name="variantId" value={variantId} />}
    </>
  );
}

function fieldErrorOf(state: ActionState, key: string) {
  return state.status === "error" ? (state.fieldErrors as Record<string, string[]> | undefined)?.[key]?.[0] : undefined;
}

// -----------------------------------------------------------------------------
// Atributos
// -----------------------------------------------------------------------------

function describeValue(definition: AttributeDefinition, value: AttributeValue | undefined): string {
  if (!value) return "não informado";
  switch (definition.dataType) {
    case "BOOLEAN":
      return value.valueBoolean ? "Sim" : "Não";
    case "NUMBER":
      return value.valueNumber === null ? "não informado" : formatAmount(value.valueNumber, definition.unit);
    case "TEXT":
      return value.valueText ?? "não informado";
    case "ENUM":
      return definition.options.find((option) => option.id === value.optionId)?.label ?? "não informado";
  }
}

export function AttributesForm({ productId, variantId, data }: ScopeProps) {
  const [state, action] = useActionState<ActionState, FormData>(saveAttributeValuesAction, IDLE);
  useActionFeedback(state);
  const submitted = state.status === "error" ? (state.values as Record<string, string> | undefined) : undefined;
  const own = new Map(data.own.attributes.map((value) => [value.attributeId, value]));
  const inherited = new Map((data.inherited?.attributes ?? []).map((value) => [value.attributeId, value]));

  if (!data.attributes.length) {
    return (
      <p className="text-body text-muted-foreground">
        Nenhuma característica cadastrada. Crie características (ex.: sabor, peso) em Produtos › Cadastros.
      </p>
    );
  }

  const groups = [...new Set(data.attributes.map((attribute) => attribute.groupName ?? "Outras"))];

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <ScopeInputs productId={productId} variantId={variantId} />
      <FormMessage state={state.status === "error" ? state : IDLE} />
      {groups.map((group) => (
        <fieldset key={group} className="flex flex-col gap-3">
          <legend className="mb-1 text-small font-medium tracking-wide text-muted-foreground uppercase">{group}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.attributes
              .filter((attribute) => (attribute.groupName ?? "Outras") === group)
              .map((attribute) => {
                const key = `attr:${attribute.id}`;
                const value = own.get(attribute.id);
                const hint = variantId
                  ? `Produto: ${describeValue(attribute, inherited.get(attribute.id))}. Vazio = herdar.`
                  : (attribute.description ?? undefined);
                const error = fieldErrorOf(state, key);

                switch (attribute.dataType) {
                  case "BOOLEAN":
                    return (
                      <SelectField
                        key={attribute.id}
                        label={attribute.name}
                        name={key}
                        description={hint}
                        error={error}
                        defaultValue={submitted?.[key] ?? (value ? String(value.valueBoolean) : NONE)}
                        options={[
                          { value: NONE, label: variantId ? "Herdar do produto" : "Não informado" },
                          { value: "true", label: "Sim" },
                          { value: "false", label: "Não" },
                        ]}
                      />
                    );
                  case "NUMBER":
                    return (
                      <DecimalField
                        key={attribute.id}
                        label={attribute.name}
                        name={key}
                        suffix={attribute.unit ?? undefined}
                        placeholder=""
                        description={hint}
                        error={error}
                        defaultValue={submitted?.[key] ?? toDecimalInput(value?.valueNumber, 4)}
                      />
                    );
                  case "TEXT":
                    return (
                      <TextField
                        key={attribute.id}
                        label={attribute.name}
                        name={key}
                        maxLength={300}
                        description={hint}
                        error={error}
                        defaultValue={submitted?.[key] ?? value?.valueText ?? undefined}
                      />
                    );
                  case "ENUM":
                    return (
                      <SelectField
                        key={attribute.id}
                        label={attribute.name}
                        name={key}
                        description={hint}
                        error={error}
                        defaultValue={submitted?.[key] ?? value?.optionId ?? NONE}
                        options={[
                          { value: NONE, label: variantId ? "Herdar do produto" : "Não informado" },
                          ...attribute.options
                            .filter((option) => option.isActive || option.id === value?.optionId)
                            .map((option) => ({ value: option.id, label: option.label })),
                        ]}
                      />
                    );
                }
              })}
          </div>
        </fieldset>
      ))}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Salvando…">Salvar características</SubmitButton>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Alérgenos
// -----------------------------------------------------------------------------

export function AllergensForm({ productId, variantId, data }: ScopeProps) {
  const [state, action] = useActionState<ActionState, FormData>(saveAllergensAction, IDLE);
  useActionFeedback(state);
  const own = new Map(data.own.allergens.map((value) => [value.code, value]));
  const inherited = new Map((data.inherited?.allergens ?? []).map((value) => [value.code, value]));
  const defaultSource = data.own.allergens[0]?.source ?? "LABEL";

  const [presence, setPresence] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      data.allergens.map((allergen) => [allergen.code, own.get(allergen.code)?.presence ?? "UNKNOWN"]),
    ),
  );

  const unknownLabel = variantId ? "Herdar" : "Não informado";
  const presenceLabel: Record<string, string> = { TRUE: "Contém", FALSE: "Não contém", UNKNOWN: "Não informado" };

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <ScopeInputs productId={productId} variantId={variantId} />
      <FormMessage state={state.status === "error" ? state : IDLE} />

      <div className="flex gap-2 rounded-lg bg-info-soft px-3 py-2.5 text-small text-info">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          “Não informado” nunca é tratado como ausência. A IA e os vendedores só poderão afirmar que o produto não
          contém um alérgeno quando ele estiver marcado como <strong>Não contém</strong>.
        </p>
      </div>

      <SelectField
        label="Origem da informação"
        name="source"
        required
        options={INFO_SOURCES}
        defaultValue={defaultSource}
        className="sm:max-w-xs"
      />

      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {data.allergens.map((allergen) => {
          const current = presence[allergen.code] ?? "UNKNOWN";
          const ownValue = own.get(allergen.code);
          const inheritedValue = inherited.get(allergen.code);
          return (
            <li key={allergen.code} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col">
                <span className="text-body font-medium">{allergen.name}</span>
                <span className="text-small text-muted-foreground">
                  {variantId
                    ? `Produto: ${inheritedValue ? presenceLabel[inheritedValue.presence] : "não informado"}${inheritedValue?.mayContainTraces ? " (pode conter traços)" : ""}`
                    : allergen.description}
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <RadioGroup
                  name={`allergen:${allergen.code}:presence`}
                  value={current}
                  onValueChange={(value) => setPresence((previous) => ({ ...previous, [allergen.code]: value }))}
                  className="flex w-auto flex-wrap gap-1 rounded-lg bg-secondary p-1"
                  aria-label={`Presença de ${allergen.name}`}
                >
                  {(["TRUE", "FALSE", "UNKNOWN"] as const).map((option) => (
                    <Label
                      key={option}
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-small font-medium text-muted-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        current === option && "bg-card text-foreground shadow-sm",
                        current === option && option === "TRUE" && "text-warning",
                        current === option && option === "FALSE" && "text-success",
                      )}
                    >
                      <RadioGroupItem value={option} className="sr-only" />
                      {option === "UNKNOWN" ? unknownLabel : presenceLabel[option]}
                    </Label>
                  ))}
                </RadioGroup>
                {current === "FALSE" && (
                  <Label className="flex items-center gap-2 text-small font-normal text-muted-foreground">
                    <Checkbox name={`allergen:${allergen.code}:traces`} defaultChecked={ownValue?.mayContainTraces} />
                    Pode conter traços
                  </Label>
                )}
                {ownValue?.notes && (
                  <input type="hidden" name={`allergen:${allergen.code}:notes`} value={ownValue.notes} />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Salvando…">Salvar alérgenos</SubmitButton>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Informação nutricional
// -----------------------------------------------------------------------------

export function NutritionForm({ productId, variantId, data }: ScopeProps) {
  const own = data.own.nutrition;
  const inherited = data.inherited?.nutrition ?? null;
  const [editing, setEditing] = useState(Boolean(own) || !variantId);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (!editing) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body text-muted-foreground">
          {inherited
            ? "Esta variação usa a tabela nutricional do produto."
            : "Nem o produto nem esta variação possuem tabela nutricional."}
        </p>
        <Button variant="outline" onClick={() => setEditing(true)}>
          Criar tabela específica da variação
        </Button>
      </div>
    );
  }

  return (
    <>
      <NutritionEditor
        productId={productId}
        variantId={variantId}
        data={data}
        initial={own ?? inherited}
        onRemove={own ? () => setConfirmRemove(true) : undefined}
      />
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remover tabela nutricional?"
        description="Os valores voltam a ser “não informados”. Esta ação é registrada na auditoria."
        confirmLabel="Remover"
        destructive
        onConfirm={() => removeNutritionAction(productId, variantId)}
        onSuccess={() => variantId && setEditing(false)}
      />
    </>
  );
}

function NutritionEditor({
  productId,
  variantId,
  data,
  initial,
  onRemove,
}: ScopeProps & { initial: NutritionValue | null; onRemove?: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(saveNutritionAction, IDLE);
  useActionFeedback(state);
  const submitted = state.status === "error" ? (state.values as Record<string, string> | undefined) : undefined;
  const extrasId = useId();

  const extras = data.nutrients.filter((nutrient) => !nutrient.isCore);
  const [showExtras, setShowExtras] = useState(() =>
    extras.some((nutrient) => initial?.values[nutrient.code] !== undefined),
  );

  const nutrientField = (nutrient: (typeof data.nutrients)[number]) => {
    const key = `nutrient:${nutrient.code}`;
    return (
      <DecimalField
        key={nutrient.code}
        label={nutrient.name}
        name={key}
        suffix={nutrient.unit}
        placeholder="—"
        error={fieldErrorOf(state, key)}
        defaultValue={submitted?.[key] ?? toDecimalInput(initial?.values[nutrient.code], 3)}
      />
    );
  };

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <ScopeInputs productId={productId} variantId={variantId} />
      <FormMessage state={state.status === "error" ? state : IDLE} />

      <div className="grid gap-4 sm:grid-cols-4">
        <DecimalField
          label="Porção"
          name="servingSize"
          required
          placeholder="30"
          error={fieldErrorOf(state, "servingSize")}
          defaultValue={submitted?.servingSize ?? toDecimalInput(initial?.servingSize)}
        />
        <SelectField
          label="Unidade"
          name="servingUnit"
          required
          options={[
            { value: "g", label: "gramas (g)" },
            { value: "ml", label: "mililitros (ml)" },
            { value: "un", label: "unidades" },
          ]}
          defaultValue={submitted?.servingUnit ?? initial?.servingUnit ?? "g"}
        />
        <TextField
          label="Descrição da porção"
          name="servingDescription"
          placeholder="1 scoop (30 g)"
          maxLength={80}
          defaultValue={submitted?.servingDescription ?? initial?.servingDescription ?? undefined}
        />
        <DecimalField
          label="Porções por embalagem"
          name="servingsPerContainer"
          placeholder="—"
          error={fieldErrorOf(state, "servingsPerContainer")}
          defaultValue={submitted?.servingsPerContainer ?? toDecimalInput(initial?.servingsPerContainer)}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h4 className="text-small font-medium tracking-wide text-muted-foreground uppercase">Valores por porção</h4>
        <p className="text-small text-muted-foreground">
          Deixe vazio o que não consta na fonte — vazio significa não informado, nunca zero.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.nutrients.filter((n) => n.isCore).map(nutrientField)}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          aria-expanded={showExtras}
          aria-controls={extrasId}
          onClick={() => setShowExtras((value) => !value)}
        >
          <ChevronDown className={cn("transition-transform", showExtras && "rotate-180")} />
          {showExtras ? "Ocultar outros nutrientes" : "Outros nutrientes (creatina, cafeína, vitaminas…)"}
        </Button>
        <div id={extrasId} hidden={!showExtras} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {extras.map(nutrientField)}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Origem da informação"
          name="source"
          required
          options={INFO_SOURCES}
          error={fieldErrorOf(state, "source")}
          defaultValue={submitted?.source ?? initial?.source ?? "LABEL"}
          description={initial ? `Atual: ${INFO_SOURCE_LABEL[initial.source]}` : undefined}
        />
        <TextareaField
          label="Observação sobre a fonte"
          name="sourceNotes"
          rows={2}
          maxLength={300}
          placeholder="Ex.: rótulo do lote 2026"
          defaultValue={submitted?.sourceNotes ?? initial?.sourceNotes ?? undefined}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        {onRemove ? (
          <Button type="button" variant="ghost" onClick={onRemove}>
            <Trash2 /> Remover tabela
          </Button>
        ) : (
          <span />
        )}
        <SubmitButton pendingLabel="Salvando…">Salvar informação nutricional</SubmitButton>
      </div>
    </form>
  );
}
