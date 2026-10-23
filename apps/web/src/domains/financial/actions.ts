"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenantContext, type TenantContext } from "@/domains/tenants/context";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";
import {
  createEntrySchema,
  createExpenseSchema,
  payEntrySchema,
  updateEntrySchema,
  type CreateEntryField,
  type CreateExpenseField,
  type PayEntryField,
  type UpdateEntryField,
} from "./schemas";

function canWrite(context: TenantContext): boolean {
  return context.hasModule("financial") && context.can("financial.write");
}

function forbidden<T extends string>(): ActionState<T> {
  return { status: "error", message: toUserMessage({ message: "forbidden" }) };
}

function refresh(customerId: string | null | undefined) {
  if (customerId) revalidatePath(`/app/clientes/${customerId}`);
  revalidatePath("/app/financeiro");
}

export async function createExpenseAction(
  _prev: ActionState<CreateExpenseField>,
  formData: FormData,
): Promise<ActionState<CreateExpenseField>> {
  const context = await requireTenantContext();
  if (!canWrite(context)) return forbidden();
  const input = formDataToObject(formData);
  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;
  const installments = data.recurring ? 1 : data.installments;
  if (Math.round(data.total * 100) < installments) {
    return { status: "error", message: "O valor é pequeno demais para tantas parcelas.", values: safeFormValues(input) };
  }

  const supabase = await createClient();
  const { error } = data.recurring
    ? await supabase.rpc("financial_recurring_create", {
        p_tenant_id: context.tenant.id,
        p_description: data.description,
        p_amount: data.total,
        p_day_of_month: Number(data.firstDueDate.slice(8, 10)),
        p_first_month: `${data.firstDueDate.slice(0, 7)}-01`,
        p_category: data.category ?? undefined,
        p_payment_method: data.paymentMethod ?? undefined,
      })
    : await supabase.rpc("financial_expense_create", {
        p_tenant_id: context.tenant.id,
        p_description: data.description,
        p_total: data.total,
        p_first_due_date: data.firstDueDate,
        p_installments: installments,
        p_category: data.category ?? undefined,
        p_payment_method: data.paymentMethod ?? undefined,
        p_notes: data.notes ?? undefined,
      });
  if (error) {
    logger.warn({ event: "financial.expense_create", status: "error", tenant_id: context.tenant.id, code: error.message });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }
  refresh(null);
  if (data.recurring) return { status: "success", message: "Despesa fixa criada. Ela se repete todo mês." };
  return { status: "success", message: installments > 1 ? `${installments} parcelas lançadas.` : "Despesa lançada." };
}

export async function endRecurringExpenseAction(recurringId: string): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!canWrite(context) || !z.uuid().safeParse(recurringId).success) return forbidden();
  const supabase = await createClient();
  const { error } = await supabase.rpc("financial_recurring_end", { p_recurring_id: recurringId });
  if (error) return { status: "error", message: toUserMessage(error) };
  refresh(null);
  return { status: "success", message: "Despesa fixa encerrada. A parcela deste mês continua na lista." };
}

export async function createEntryAction(
  _prev: ActionState<CreateEntryField>,
  formData: FormData,
): Promise<ActionState<CreateEntryField>> {
  const context = await requireTenantContext();
  if (!canWrite(context)) return forbidden();
  const input = formDataToObject(formData);
  const parsed = createEntrySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;
  if (Math.round(data.total * 100) < data.installments) {
    return { status: "error", message: "O valor é pequeno demais para tantas parcelas.", values: safeFormValues(input) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("financial_entry_create", {
    p_tenant_id: context.tenant.id,
    p_customer_id: data.customerId,
    p_description: data.description,
    p_total: data.total,
    p_first_due_date: data.firstDueDate,
    p_installments: data.installments,
    p_payment_method: data.paymentMethod ?? undefined,
    p_notes: data.notes ?? undefined,
  });
  if (error) {
    logger.warn({ event: "financial.entry_create", status: "error", tenant_id: context.tenant.id, code: error.message });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }
  refresh(data.customerId);
  return { status: "success", message: data.installments > 1 ? `${data.installments} parcelas lançadas.` : "Lançamento criado." };
}

export async function updateEntryAction(
  _prev: ActionState<UpdateEntryField>,
  formData: FormData,
): Promise<ActionState<UpdateEntryField>> {
  const context = await requireTenantContext();
  if (!canWrite(context)) return forbidden();
  const input = formDataToObject(formData);
  const parsed = updateEntrySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("financial_entry_update", {
    p_entry_id: data.entryId,
    p_description: data.description,
    p_amount: data.amount,
    p_due_date: data.dueDate,
    p_payment_method: data.paymentMethod ?? undefined,
  });
  if (error) {
    logger.warn({ event: "financial.entry_update", status: "error", tenant_id: context.tenant.id, code: error.message });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }
  refresh(input.customerId);
  return { status: "success", message: "Parcela atualizada." };
}

export async function payEntryAction(
  _prev: ActionState<PayEntryField>,
  formData: FormData,
): Promise<ActionState<PayEntryField>> {
  const context = await requireTenantContext();
  if (!canWrite(context)) return forbidden();
  const input = formDataToObject(formData);
  const parsed = payEntrySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("financial_entry_pay", {
    p_entry_id: data.entryId,
    p_paid_at: data.paidAt,
    p_payment_method: data.paymentMethod ?? undefined,
  });
  if (error) {
    logger.warn({ event: "financial.entry_pay", status: "error", tenant_id: context.tenant.id, code: error.message });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }
  refresh(input.customerId);
  return { status: "success", message: "Pagamento registrado." };
}

export async function reverseEntryPaymentAction(entryId: string, customerId: string | null): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!canWrite(context) || !z.uuid().safeParse(entryId).success) return forbidden();
  const supabase = await createClient();
  const { error } = await supabase.rpc("financial_entry_unpay", { p_entry_id: entryId });
  if (error) return { status: "error", message: toUserMessage(error) };
  refresh(customerId);
  return { status: "success", message: "Pagamento estornado. A parcela voltou a ficar em aberto." };
}

export async function cancelEntryAction(entryId: string, customerId: string | null): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!canWrite(context) || !z.uuid().safeParse(entryId).success) return forbidden();
  const supabase = await createClient();
  const { error } = await supabase.rpc("financial_entry_cancel", { p_entry_id: entryId });
  if (error) return { status: "error", message: toUserMessage(error) };
  refresh(customerId);
  return { status: "success", message: "Parcela cancelada." };
}
