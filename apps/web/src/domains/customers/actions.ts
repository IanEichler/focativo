"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenantContext } from "@/domains/tenants/context";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";
import { lookupCustomers } from "./queries";
import { customerSchema, type CustomerField } from "./schemas";

const CUSTOMERS_PATH = "/app/clientes";

function forbidden(): ActionState<CustomerField> {
  return { status: "error", message: toUserMessage({ message: "forbidden" }) };
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

export async function saveCustomerAction(
  _prev: ActionState<CustomerField>,
  formData: FormData,
): Promise<ActionState<CustomerField>> {
  const context = await requireTenantContext();
  const input = formDataToObject(formData);

  if (!context.can("customers.write")) return forbidden();
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;

  const values = {
    name: data.name,
    phone: data.phone,
    whatsapp: data.whatsapp,
    email: data.email,
    document: data.document,
    birthday: data.birthday,
    notes: data.notes,
    tags: parseTags(data.tags),
    origin: data.origin,
    responsible_user_id: data.responsibleUserId,
    archived_at: data.archived ? new Date().toISOString() : null,
  };

  const supabase = await createClient();
  const query = data.id
    ? supabase.from("customers").update(values).eq("id", data.id).eq("tenant_id", context.tenant.id).select("id")
    : supabase
        .from("customers")
        .insert({ ...values, tenant_id: context.tenant.id })
        .select("id");

  const { data: row, error } = await query.single();
  if (error || !row) {
    logger.warn({ event: "customer.save", status: "error", tenant_id: context.tenant.id, code: error?.code });
    return {
      status: "error",
      message: error ? toUserMessage(error) : toUserMessage({ message: "forbidden" }),
      values: safeFormValues(input),
    };
  }

  logger.info({ event: "customer.save", status: "ok", tenant_id: context.tenant.id, user_id: context.user.id });
  revalidatePath(CUSTOMERS_PATH);
  revalidatePath(`${CUSTOMERS_PATH}/${row.id}`);
  return { status: "success", message: data.id ? "Cliente atualizado." : "Cliente cadastrado.", id: row.id };
}

export async function archiveCustomerAction(customerId: string, archived: boolean): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("customers.write") || !z.uuid().safeParse(customerId).success) return forbidden();

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", customerId)
    .eq("tenant_id", context.tenant.id);

  if (error) return { status: "error", message: toUserMessage(error) };
  revalidatePath(CUSTOMERS_PATH);
  revalidatePath(`${CUSTOMERS_PATH}/${customerId}`);
  return { status: "success", message: archived ? "Cliente arquivado." : "Cliente reativado." };
}

export async function searchCustomersAction(query: string) {
  const context = await requireTenantContext();
  if (!context.can("customers.read")) return [];
  return lookupCustomers(context, z.string().max(100).catch("").parse(query).trim());
}
