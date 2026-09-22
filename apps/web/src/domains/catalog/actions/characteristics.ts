"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenantContext } from "@/domains/tenants/context";
import { parseDecimalBR } from "@/lib/decimal";
import { GENERIC_ERROR_MESSAGE, toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, validationError } from "@/lib/validation";
import { allergenEntrySchema, nutrientAmount, nutritionSchema } from "../schemas";

const scopeSchema = z.object({
  productId: z.uuid(),
  variantId: z
    .string()
    .optional()
    .transform((value) => value || null)
    .pipe(z.uuid().nullable()),
});

async function prepare(formData: FormData) {
  const context = await requireTenantContext();
  if (!context.can("catalog.write")) {
    return { error: { status: "error", message: toUserMessage({ message: "forbidden" }) } as ActionState };
  }
  const input = formDataToObject(formData);
  const scope = scopeSchema.safeParse(input);
  if (!scope.success) return { error: { status: "error", message: GENERIC_ERROR_MESSAGE } as ActionState };
  return { context, input, scope: scope.data };
}

function finish(productId: string, message: string): ActionState {
  revalidatePath(`/app/produtos/${productId}`);
  return { status: "success", message };
}

/** Campos `attr:<attribute_id>`. Tipos são validados novamente no banco. */
export async function saveAttributeValuesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const prepared = await prepare(formData);
  if ("error" in prepared) return prepared.error!;
  const { context, input, scope } = prepared;

  const supabase = await createClient();
  const { data: definitions } = await supabase
    .from("product_attributes")
    .select("id, name, data_type")
    .eq("tenant_id", context.tenant.id)
    .eq("is_active", true);

  const values: { attribute_id: string; value: boolean | number | string }[] = [];
  const fieldErrors: Record<string, string[]> = {};

  for (const definition of definitions ?? []) {
    const raw = input[`attr:${definition.id}`]?.trim();
    if (!raw) continue;
    switch (definition.data_type) {
      case "BOOLEAN":
        if (raw !== "true" && raw !== "false") continue;
        values.push({ attribute_id: definition.id, value: raw === "true" });
        break;
      case "NUMBER": {
        const number = parseDecimalBR(raw);
        if (number === null || Number.isNaN(number) || number < 0 || number > 9_999_999_999) {
          fieldErrors[`attr:${definition.id}`] = [`${definition.name}: informe um número válido.`];
          continue;
        }
        values.push({ attribute_id: definition.id, value: number });
        break;
      }
      case "TEXT":
        if (raw.length > 300) {
          fieldErrors[`attr:${definition.id}`] = [`${definition.name}: máximo de 300 caracteres.`];
          continue;
        }
        values.push({ attribute_id: definition.id, value: raw });
        break;
      case "ENUM":
        if (!z.uuid().safeParse(raw).success) continue;
        values.push({ attribute_id: definition.id, value: raw });
        break;
    }
  }

  if (Object.keys(fieldErrors).length) {
    return {
      status: "error",
      message: "Revise os campos destacados.",
      fieldErrors,
      values: input as Record<string, string>,
    };
  }

  const { error } = await supabase.rpc("catalog_set_attribute_values", {
    p_product_id: scope.productId,
    p_variant_id: scope.variantId ?? undefined,
    p_values: values,
  });
  if (error) {
    logger.warn({ event: "product.attributes", status: "error", tenant_id: context.tenant.id, code: error.message });
    return { status: "error", message: toUserMessage(error) };
  }
  return finish(scope.productId, "Características salvas.");
}

/** Campos `allergen:<code>:presence|traces|notes` + `source` (origem única do bloco). */
export async function saveAllergensAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const prepared = await prepare(formData);
  if ("error" in prepared) return prepared.error!;
  const { context, input, scope } = prepared;

  const codes = new Set(
    Object.keys(input)
      .map((key) => /^allergen:([a-z_]+):presence$/.exec(key)?.[1])
      .filter((code): code is string => Boolean(code)),
  );

  const entries = [];
  for (const code of codes) {
    const parsed = allergenEntrySchema.safeParse({
      code,
      presence: input[`allergen:${code}:presence`] ?? "UNKNOWN",
      mayContainTraces: input[`allergen:${code}:traces`] === "on",
      source: input.source,
      notes: input[`allergen:${code}:notes`] ?? null,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.path[0] === "source") {
        return { status: "error", message: "Informe a origem da informação dos alérgenos." };
      }
      return { status: "error", message: issue?.message ?? GENERIC_ERROR_MESSAGE };
    }
    entries.push({
      code: parsed.data.code,
      presence: parsed.data.presence,
      may_contain_traces: parsed.data.mayContainTraces,
      source: parsed.data.source,
      notes: parsed.data.notes || null,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("catalog_set_allergens", {
    p_product_id: scope.productId,
    p_variant_id: scope.variantId ?? undefined,
    p_allergens: entries,
  });
  if (error) {
    logger.warn({ event: "product.allergens", status: "error", tenant_id: context.tenant.id, code: error.message });
    return { status: "error", message: toUserMessage(error) };
  }
  return finish(scope.productId, "Alérgenos salvos.");
}

/** Campos da porção + `nutrient:<code>`. Nutriente vazio = não informado (nunca zero). */
export async function saveNutritionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const prepared = await prepare(formData);
  if ("error" in prepared) return prepared.error!;
  const { context, input, scope } = prepared;

  const parsed = nutritionSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const values: Record<string, number> = {};
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(input)) {
    const code = /^nutrient:([a-z0-9_]+)$/.exec(key)?.[1];
    if (!code) continue;
    const amount = nutrientAmount("Valor").safeParse(raw);
    if (!amount.success) {
      fieldErrors[key] = [amount.error.issues[0]?.message ?? "Valor inválido."];
      continue;
    }
    if (amount.data !== null) values[code] = amount.data;
  }
  if (Object.keys(fieldErrors).length) {
    return {
      status: "error",
      message: "Revise os valores nutricionais.",
      fieldErrors,
      values: input as Record<string, string>,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("catalog_set_nutrition", {
    p_product_id: scope.productId,
    p_variant_id: scope.variantId ?? undefined,
    p_nutrition: {
      serving_size: parsed.data.servingSize,
      serving_unit: parsed.data.servingUnit,
      serving_description: parsed.data.servingDescription,
      servings_per_container: parsed.data.servingsPerContainer,
      source: parsed.data.source,
      source_notes: parsed.data.sourceNotes,
      values,
    },
  });
  if (error) {
    logger.warn({ event: "product.nutrition", status: "error", tenant_id: context.tenant.id, code: error.message });
    return { status: "error", message: toUserMessage(error), values: input as Record<string, string> };
  }
  return finish(scope.productId, "Informação nutricional salva.");
}

export async function removeNutritionAction(productId: string, variantId: string | null): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("catalog.write")) return { status: "error", message: toUserMessage({ message: "forbidden" }) };
  const scope = scopeSchema.safeParse({ productId, variantId: variantId ?? undefined });
  if (!scope.success) return { status: "error", message: GENERIC_ERROR_MESSAGE };

  const supabase = await createClient();
  const { error } = await supabase.rpc("catalog_set_nutrition", {
    p_product_id: scope.data.productId,
    p_variant_id: scope.data.variantId ?? undefined,
    p_nutrition: null,
  });
  if (error) return { status: "error", message: toUserMessage(error) };
  return finish(scope.data.productId, "Informação nutricional removida.");
}
