/**
 * Resumo legível das características EFETIVAS de uma variante.
 *
 * Regras de segurança da informação:
 *   * "Sem X" somente quando o cadastro diz explicitamente NÃO CONTÉM e não há
 *     alerta de traços. Desconhecido nunca vira "sem X".
 *   * Nutriente ausente não é zero; só aparece o que foi informado.
 */

export type Presence = "TRUE" | "FALSE" | "UNKNOWN";

export interface EffectiveAllergen {
  code: string;
  name: string;
  presence: Presence;
  mayContainTraces: boolean;
}

export interface EffectiveAttribute {
  code: string;
  name: string;
  dataType: "BOOLEAN" | "NUMBER" | "TEXT" | "ENUM";
  unit: string | null;
  valueBoolean: boolean | null;
  valueNumber: number | null;
  valueText: string | null;
  optionLabel: string | null;
}

export interface EffectiveNutrition {
  servingSize: number;
  servingUnit: string;
  values: Record<string, number>;
}

export interface NutrientDefinition {
  code: string;
  name: string;
  unit: string;
}

export type ChipTone = "positive" | "warning" | "neutral" | "unknown";

export interface CharacteristicChip {
  key: string;
  label: string;
  tone: ChipTone;
}

/** Alérgenos cuja ausência é destacada como diferencial ("Sem lactose"). */
const HIGHLIGHT_FREE = new Set(["lactose", "gluten", "milk", "soy", "peanut"]);

const FREE_LABEL: Record<string, string> = {
  lactose: "Sem lactose",
  gluten: "Sem glúten",
  milk: "Sem leite",
  soy: "Sem soja",
  peanut: "Sem amendoim",
};

const HIGHLIGHT_NUTRIENTS = ["protein", "carbohydrates", "total_sugars", "energy"];

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export function formatAmount(value: number, unit: string | null): string {
  const text = numberFormat.format(value);
  if (!unit) return text;
  return unit === "kcal" ? `${text} kcal` : `${text} ${unit}`;
}

export function allergenChips(allergens: EffectiveAllergen[]): CharacteristicChip[] {
  const chips: CharacteristicChip[] = [];
  for (const allergen of allergens) {
    if (allergen.presence === "TRUE") {
      chips.push({ key: `allergen-${allergen.code}`, label: `Contém ${allergen.name.toLowerCase()}`, tone: "warning" });
    } else if (allergen.presence === "FALSE" && allergen.mayContainTraces) {
      chips.push({
        key: `allergen-${allergen.code}`,
        label: `Pode conter traços de ${allergen.name.toLowerCase()}`,
        tone: "warning",
      });
    } else if (allergen.presence === "FALSE" && HIGHLIGHT_FREE.has(allergen.code)) {
      chips.push({
        key: `allergen-${allergen.code}`,
        label: FREE_LABEL[allergen.code] ?? `Sem ${allergen.name.toLowerCase()}`,
        tone: "positive",
      });
    }
  }
  return chips;
}

export function attributeChips(attributes: EffectiveAttribute[]): CharacteristicChip[] {
  return attributes.flatMap<CharacteristicChip>((attribute) => {
    const key = `attribute-${attribute.code}`;
    switch (attribute.dataType) {
      case "BOOLEAN":
        return attribute.valueBoolean ? [{ key, label: attribute.name, tone: "positive" }] : [];
      case "ENUM":
        return attribute.optionLabel ? [{ key, label: attribute.optionLabel, tone: "neutral" }] : [];
      case "NUMBER":
        return attribute.valueNumber === null
          ? []
          : [
              {
                key,
                label: `${attribute.name}: ${formatAmount(attribute.valueNumber, attribute.unit)}`,
                tone: "neutral",
              },
            ];
      case "TEXT":
        return attribute.valueText ? [{ key, label: attribute.valueText, tone: "neutral" }] : [];
    }
  });
}

export function nutritionChips(
  nutrition: EffectiveNutrition | null,
  nutrients: NutrientDefinition[],
): CharacteristicChip[] {
  if (!nutrition) return [];
  const byCode = new Map(nutrients.map((nutrient) => [nutrient.code, nutrient]));
  return HIGHLIGHT_NUTRIENTS.flatMap<CharacteristicChip>((code) => {
    const amount = nutrition.values[code];
    const definition = byCode.get(code);
    if (amount === undefined || !definition) return [];
    return [
      {
        key: `nutrient-${code}`,
        label: `${formatAmount(amount, definition.unit)} ${definition.name.toLowerCase()}`,
        tone: "neutral",
      },
    ];
  });
}

/** Alérgenos relevantes ainda sem informação (orienta o cadastro, nunca o cliente). */
export function unknownHighlights(allergens: EffectiveAllergen[]): CharacteristicChip[] {
  return allergens
    .filter((allergen) => allergen.presence === "UNKNOWN" && HIGHLIGHT_FREE.has(allergen.code))
    .map((allergen) => ({
      key: `unknown-${allergen.code}`,
      label: `${allergen.name}: não informado`,
      tone: "unknown" as const,
    }));
}
