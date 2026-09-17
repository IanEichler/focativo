"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenantContext } from "@/domains/tenants/context";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";
import { listVariantLots, lookupVariants, type VariantOption } from "./queries";
import { adjustSchema, entrySchema, lossSchema, type AdjustField, type EntryField, type LossField } from "./schemas";

function revalidateInventory() {
  revalidatePath("/app/estoque");
  revalidatePath("/app/produtos", "layout");
  revalidatePath("/app/dashboard");
}

function denied(): ActionState<never> {
  return { status: "error", message: toUserMessage({ message: "forbidden" }) };
}

export async function registerEntryAction(
  _prev: ActionState<EntryField>,
  formData: FormData,
): Promise<ActionState<EntryField>> {
  const context = await requireTenantContext();
  if (!context.can("inventory.entry")) return denied();

  const input = formDataToObject(formData);
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;

  if (data.unitCost !== null && !context.can("catalog.costs")) return denied();

  const supabase = await createClient();
  const { error } = await supabase.rpc("inventory_register_entry", {
    p_variant_id: data.variantId,
    p_quantity: data.quantity,
    p_idempotency_key: data.idempotencyKey,
    p_reason: data.reason ?? undefined,
    p_unit_cost: data.unitCost ?? undefined,
    p_lot_id: data.lotId ?? undefined,
    p_lot_code: data.lotId ? undefined : (data.lotCode ?? undefined),
    p_manufactured_on: data.manufacturedOn ?? undefined,
    p_expires_on: data.expiresOn ?? undefined,
    p_supplier_id: data.supplierId ?? undefined,
  });

  if (error) {
    logger.warn({ event: "inventory.entry", status: "error", tenant_id: context.tenant.id, code: error.message });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }
  logger.info({ event: "inventory.entry", status: "ok", tenant_id: context.tenant.id, user_id: context.user.id });
  revalidateInventory();
  return { status: "success", message: "Entrada registrada." };
}

export async function registerLossAction(
  _prev: ActionState<LossField>,
  formData: FormData,
): Promise<ActionState<LossField>> {
  const context = await requireTenantContext();
  if (!context.can("inventory.adjust")) return denied();

  const input = formDataToObject(formData);
  const parsed = lossSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("inventory_register_loss", {
    p_variant_id: data.variantId,
    p_quantity: data.quantity,
    p_reason: data.reason,
    p_idempotency_key: data.idempotencyKey,
    p_lot_id: data.lotId ?? undefined,
  });

  if (error) {
    logger.warn({ event: "inventory.loss", status: "error", tenant_id: context.tenant.id, code: error.message });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }
  logger.info({ event: "inventory.loss", status: "ok", tenant_id: context.tenant.id, user_id: context.user.id });
  revalidateInventory();
  return { status: "success", message: "Perda registrada." };
}

export async function adjustStockAction(
  _prev: ActionState<AdjustField>,
  formData: FormData,
): Promise<ActionState<AdjustField>> {
  const context = await requireTenantContext();
  if (!context.can("inventory.adjust")) return denied();

  const input = formDataToObject(formData);
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("inventory_adjust_stock", {
    p_variant_id: data.variantId,
    p_counted_quantity: data.countedQuantity,
    p_reason: data.reason,
    p_idempotency_key: data.idempotencyKey,
    p_lot_id: data.lotId ?? undefined,
    p_lot_code: data.lotId ? undefined : (data.lotCode ?? undefined),
    p_expires_on: data.expiresOn ?? undefined,
  });

  if (error) {
    logger.warn({ event: "inventory.adjust", status: "error", tenant_id: context.tenant.id, code: error.message });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }
  logger.info({ event: "inventory.adjust", status: "ok", tenant_id: context.tenant.id, user_id: context.user.id });
  revalidateInventory();
  return { status: "success", message: "Ajuste registrado." };
}

// -----------------------------------------------------------------------------
// Leituras sob demanda para os diálogos (Server Functions, protegidas pelo RLS)
// -----------------------------------------------------------------------------

export async function searchVariantsAction(query: string): Promise<VariantOption[]> {
  const context = await requireTenantContext();
  if (!context.can("inventory.read")) return [];
  return lookupVariants(context, z.string().max(100).catch("").parse(query).trim());
}

export async function variantLotsAction(variantId: string) {
  const context = await requireTenantContext();
  if (!context.can("inventory.read") || !z.uuid().safeParse(variantId).success) return [];
  return listVariantLots(context, variantId);
}
