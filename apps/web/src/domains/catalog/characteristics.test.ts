import { describe, expect, it } from "vitest";
import {
  allergenChips,
  attributeChips,
  nutritionChips,
  unknownHighlights,
  type EffectiveAllergen,
  type EffectiveAttribute,
} from "./characteristics";

const allergen = (code: string, presence: EffectiveAllergen["presence"], mayContainTraces = false): EffectiveAllergen => ({
  code,
  name: { lactose: "Lactose", gluten: "Glúten", soy: "Soja", milk: "Leite e derivados", egg: "Ovos" }[code] ?? code,
  presence,
  mayContainTraces,
});

describe("allergen chips (safety rules)", () => {
  it("never claims absence for UNKNOWN", () => {
    const labels = allergenChips([allergen("lactose", "UNKNOWN"), allergen("gluten", "UNKNOWN")]).map((chip) => chip.label);
    expect(labels).toEqual([]);
    expect(labels.join(" ")).not.toMatch(/sem/i);
  });

  it("says 'sem' only for explicit FALSE without traces", () => {
    expect(allergenChips([allergen("lactose", "FALSE")])).toEqual([
      { key: "allergen-lactose", label: "Sem lactose", tone: "positive" },
    ]);
    expect(allergenChips([allergen("soy", "FALSE", true)])[0]).toMatchObject({
      label: "Pode conter traços de soja",
      tone: "warning",
    });
  });

  it("warns about contained allergens", () => {
    expect(allergenChips([allergen("milk", "TRUE")])[0]).toMatchObject({ label: "Contém leite e derivados", tone: "warning" });
  });

  it("does not highlight absence of non-highlighted allergens", () => {
    expect(allergenChips([allergen("egg", "FALSE")])).toEqual([]);
  });

  it("lists relevant unknowns for catalog completion", () => {
    expect(unknownHighlights([allergen("lactose", "UNKNOWN"), allergen("egg", "UNKNOWN")]).map((chip) => chip.label)).toEqual([
      "Lactose: não informado",
    ]);
  });
});

describe("attribute and nutrition chips", () => {
  const attribute = (partial: Partial<EffectiveAttribute>): EffectiveAttribute => ({
    code: "x",
    name: "X",
    dataType: "TEXT",
    unit: null,
    valueBoolean: null,
    valueNumber: null,
    valueText: null,
    optionLabel: null,
    ...partial,
  });

  it("renders only informed values", () => {
    const chips = attributeChips([
      attribute({ code: "flavor", dataType: "ENUM", optionLabel: "Chocolate" }),
      attribute({ code: "net_weight", name: "Peso líquido", dataType: "NUMBER", unit: "g", valueNumber: 900 }),
      attribute({ code: "vegan", name: "Vegano", dataType: "BOOLEAN", valueBoolean: false }),
      attribute({ code: "sugar_free_claim", name: "Sem açúcar", dataType: "BOOLEAN", valueBoolean: true }),
    ]);
    expect(chips.map((chip) => chip.label)).toEqual(["Chocolate", "Peso líquido: 900 g", "Sem açúcar"]);
  });

  it("shows nutrients present in the table, never inventing zeros", () => {
    const nutrients = [
      { code: "protein", name: "Proteínas", unit: "g" },
      { code: "carbohydrates", name: "Carboidratos", unit: "g" },
      { code: "total_sugars", name: "Açúcares totais", unit: "g" },
    ];
    const chips = nutritionChips({ servingSize: 30, servingUnit: "g", values: { protein: 24, total_sugars: 0 } }, nutrients);
    expect(chips.map((chip) => chip.label)).toEqual(["24 g proteínas", "0 g açúcares totais"]);
    expect(nutritionChips(null, nutrients)).toEqual([]);
  });
});
