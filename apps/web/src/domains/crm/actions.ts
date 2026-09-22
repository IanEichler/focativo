"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenantContext } from "@/domains/tenants/context";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";
import { opportunitySchema, stageSchema, type OpportunityField, type StageField } from "./schemas";

const CRM_PATH = "/app/crm";

function forbidden<Field extends string = never>(): ActionState<Field> {
  return { status: "error", message: toUserMessage({ message: "forbidden" }) };
}

function revalidate(customerId?: string) {
  revalidatePath(CRM_PATH);
  if (customerId) revalidatePath(`/app/clientes/${customerId}`);
}

export async function saveOpportunityAction(
  _prev: ActionState<OpportunityField>,
  formData: FormData,
): Promise<ActionState<OpportunityField>> {
  const context = await requireTenantContext();
  if (!context.can("crm.write")) return forbidden();

  const input = formDataToObject(formData);
  const parsed = opportunitySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;

  const supabase = await createClient();

  if (data.id) {
    const { error } = await supabase.rpc("crm_update_opportunity", {
      p_opportunity_id: data.id,
      p_title: data.title ?? undefined,
      p_estimated_value: data.estimatedValue ?? undefined,
      p_responsible_user_id: data.responsibleUserId ?? undefined,
      p_origin: data.origin ?? undefined,
      p_notes: data.notes ?? undefined,
      p_expected_at: data.expectedAt ?? undefined,
    });
    if (error) {
      logger.warn({
        event: "crm.opportunity.update",
        status: "error",
        tenant_id: context.tenant.id,
        code: error.message,
      });
      return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
    }
    await supabase.rpc("crm_set_opportunity_products", { p_opportunity_id: data.id, p_variant_ids: data.variantIds });
    revalidate(data.customerId);
    return { status: "success", message: "Oportunidade atualizada.", id: data.id };
  }

  const { data: opportunityId, error } = await supabase.rpc("crm_create_opportunity", {
    p_tenant_id: context.tenant.id,
    p_customer_id: data.customerId,
    p_title: data.title ?? undefined,
    p_estimated_value: data.estimatedValue ?? undefined,
    p_responsible_user_id: data.responsibleUserId ?? undefined,
    p_origin: data.origin ?? undefined,
    p_notes: data.notes ?? undefined,
    p_expected_at: data.expectedAt ?? undefined,
    p_variant_ids: data.variantIds,
  });

  if (error || !opportunityId) {
    logger.warn({
      event: "crm.opportunity.create",
      status: "error",
      tenant_id: context.tenant.id,
      code: error?.message,
    });
    return {
      status: "error",
      message: error ? toUserMessage(error) : toUserMessage({ message: "forbidden" }),
      values: safeFormValues(input),
    };
  }
  logger.info({
    event: "crm.opportunity.create",
    status: "ok",
    tenant_id: context.tenant.id,
    user_id: context.user.id,
  });
  revalidate(data.customerId);
  return { status: "success", message: "Oportunidade criada.", id: opportunityId };
}

export async function moveOpportunityAction(
  opportunityId: string,
  stageId: string,
  customerId: string,
  lostReason?: string,
) {
  const context = await requireTenantContext();
  if (!context.can("crm.write")) return forbidden();
  if (!z.uuid().safeParse(opportunityId).success || !z.uuid().safeParse(stageId).success) return forbidden();

  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_move_opportunity", {
    p_opportunity_id: opportunityId,
    p_stage_id: stageId,
    p_lost_reason: lostReason,
  });

  if (error) {
    logger.warn({ event: "crm.opportunity.move", status: "error", tenant_id: context.tenant.id, code: error.message });
    return { status: "error", message: toUserMessage(error) } as ActionState;
  }
  revalidate(customerId);
  return { status: "success" } as ActionState;
}

export async function setOpportunityProductsAction(opportunityId: string, variantIds: string[], customerId: string) {
  const context = await requireTenantContext();
  if (!context.can("crm.write")) return forbidden();
  if (!z.uuid().safeParse(opportunityId).success) return forbidden();

  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_set_opportunity_products", {
    p_opportunity_id: opportunityId,
    p_variant_ids: variantIds,
  });

  if (error) return { status: "error", message: toUserMessage(error) } as ActionState;
  revalidate(customerId);
  return { status: "success", message: "Produtos atualizados." } as ActionState;
}

export async function saveStageAction(
  _prev: ActionState<StageField>,
  formData: FormData,
): Promise<ActionState<StageField>> {
  const context = await requireTenantContext();
  if (!context.can("crm.write")) return forbidden();

  const input = formDataToObject(formData);
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const supabase = await createClient();
  const { error } = await supabase
    .from("crm_stages")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.id)
    .eq("tenant_id", context.tenant.id);

  if (error) return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  revalidate();
  return { status: "success", message: "Etapa renomeada." };
}
