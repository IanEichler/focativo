"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenantContext } from "@/domains/tenants/context";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";
import { saleSchema, type SaleField } from "./schemas";

const SALES_PATH = "/app/vendas";

function forbidden(): ActionState<SaleField> {
  return { status: "error", message: toUserMessage({ message: "forbidden" }) };
}

function revalidate(customerId?: string | null) {
  revalidatePath(SALES_PATH);
  revalidatePath("/app/estoque");
  revalidatePath("/app/dashboard");
  if (customerId) revalidatePath(`/app/clientes/${customerId}`);
}

export async function createSaleAction(
  _prev: ActionState<SaleField>,
  formData: FormData,
): Promise<ActionState<SaleField>> {
  const context = await requireTenantContext();
  if (!context.can("sales.write")) return forbidden();

  const input = formDataToObject(formData);
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;

  const supabase = await createClient();
  const { data: saleId, error } = await supabase.rpc("sale_create", {
    p_tenant_id: context.tenant.id,
    p_customer_id: data.customerId ?? undefined,
    p_items: data.items.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
    p_origin: data.origin as "BALCAO" | "WHATSAPP" | "MANUAL" | "OTHER",
    p_discount_amount: data.discountAmount ?? undefined,
    p_payment_method: data.paymentMethod ?? undefined,
    p_paid_amount: data.paidAmount ?? undefined,
    p_notes: data.notes ?? undefined,
    p_opportunity_id: data.opportunityId ?? undefined,
  });

  if (error || !saleId) {
    logger.warn({ event: "sale.create", status: "error", tenant_id: context.tenant.id, code: error?.message });
    return {
      status: "error",
      message: error ? toUserMessage(error) : toUserMessage({ message: "forbidden" }),
      values: safeFormValues(input),
    };
  }
  logger.info({ event: "sale.create", status: "ok", tenant_id: context.tenant.id, user_id: context.user.id });
  revalidate(data.customerId);
  return { status: "success", message: "Venda registrada.", id: saleId };
}

export async function cancelSaleAction(saleId: string, reason?: string): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("sales.write") || !z.uuid().safeParse(saleId).success)
    return { status: "error", message: toUserMessage({ message: "forbidden" }) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("sale_cancel", { p_sale_id: saleId, p_reason: reason });
  if (error) return { status: "error", message: toUserMessage(error) };
  revalidate();
  revalidatePath(`${SALES_PATH}/${saleId}`);
  return { status: "success", message: "Venda cancelada e estoque estornado." };
}
