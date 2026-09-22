"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenantContext } from "@/domains/tenants/context";
import { toCode } from "@/lib/codes";
import { GENERIC_ERROR_MESSAGE, toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";
import { attributeOptionSchema, attributeSchema, brandSchema, categorySchema, supplierSchema } from "../schemas";

/**
 * Cadastros simples usam escrita direta: o RLS exige catalog.write no tenant,
 * as FKs compostas impedem referências a outra empresa e tenant_id não é
 * atualizável. O servidor ainda força tenant_id do contexto verificado.
 */

const TAXONOMY_PATH = "/app/produtos/cadastros";
const idSchema = z.uuid();

type Entity = "categories" | "brands" | "suppliers" | "product_attributes" | "product_attribute_options";

async function writableContext() {
  const context = await requireTenantContext();
  return context.can("catalog.write") ? context : null;
}

function forbidden(): ActionState<never> {
  return { status: "error", message: toUserMessage({ message: "forbidden" }) };
}

function done(message: string): ActionState<never> {
  revalidatePath(TAXONOMY_PATH);
  revalidatePath("/app/produtos", "layout");
  return { status: "success", message };
}

async function persist<Field extends string>(
  entity: Entity,
  id: string | null,
  values: Record<string, unknown>,
  input: Record<string, string | undefined>,
  tenantId: string,
  successMessage: string,
): Promise<ActionState<Field>> {
  const supabase = await createClient();
  const query = id
    ? supabase
        .from(entity)
        .update(values as never)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("id")
    : supabase
        .from(entity)
        .insert({ ...values, tenant_id: tenantId } as never)
        .select("id");

  const { data, error } = await query;
  if (error || !data?.length) {
    logger.warn({ event: `${entity}.save`, status: "error", tenant_id: tenantId, code: error?.code });
    return {
      status: "error",
      message: error ? toUserMessage(error) : toUserMessage({ message: "forbidden" }),
      values: safeFormValues<Field>(input),
    };
  }
  return done(successMessage);
}

export async function saveCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const context = await writableContext();
  if (!context) return forbidden();
  const input = formDataToObject(formData);
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const { id, name, parentId, description, isActive } = parsed.data;
  if (id && parentId === id) {
    return { status: "error", message: toUserMessage({ message: "category_cycle" }) };
  }
  const values = { name, parent_id: parentId, description, is_active: isActive };
  return persist(
    "categories",
    id,
    values,
    input,
    context.tenant.id,
    id ? "Categoria atualizada." : "Categoria criada.",
  );
}

export async function saveBrandAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const context = await writableContext();
  if (!context) return forbidden();
  const input = formDataToObject(formData);
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const { id, name, isActive } = parsed.data;
  return persist(
    "brands",
    id,
    { name, is_active: isActive },
    input,
    context.tenant.id,
    id ? "Marca atualizada." : "Marca criada.",
  );
}

export async function saveSupplierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const context = await writableContext();
  if (!context) return forbidden();
  const input = formDataToObject(formData);
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const { id, name, legalName, document, email, phone, contactName, notes, isActive } = parsed.data;
  const values = {
    name,
    legal_name: legalName,
    document,
    email,
    phone,
    contact_name: contactName,
    notes,
    is_active: isActive,
  };
  return persist(
    "suppliers",
    id,
    values,
    input,
    context.tenant.id,
    id ? "Fornecedor atualizado." : "Fornecedor criado.",
  );
}

export async function saveAttributeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const context = await writableContext();
  if (!context) return forbidden();
  const input = formDataToObject(formData);
  const parsed = attributeSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;

  const common = {
    name: data.name,
    description: data.description,
    group_name: data.groupName,
    is_searchable: data.isSearchable,
    is_filterable: data.isFilterable,
    is_compatibility_enabled: data.isCompatibilityEnabled,
    is_active: data.isActive,
  };

  if (data.id) {
    // code e data_type são imutáveis; unidade só vale para números e eixo só para lista/texto.
    const supabase = await createClient();
    const { data: current } = await supabase
      .from("product_attributes")
      .select("data_type")
      .eq("id", data.id)
      .eq("tenant_id", context.tenant.id)
      .maybeSingle();
    if (!current) return { status: "error", message: toUserMessage({ message: "not_found" }) };
    return persist(
      "product_attributes",
      data.id,
      {
        ...common,
        unit: current.data_type === "NUMBER" ? data.unit : null,
        is_variant_axis: current.data_type === "ENUM" || current.data_type === "TEXT" ? data.isVariantAxis : false,
      },
      input,
      context.tenant.id,
      "Característica atualizada.",
    );
  }

  const dataType = data.dataType!;
  return persist(
    "product_attributes",
    null,
    {
      ...common,
      code: data.code,
      data_type: dataType,
      unit: dataType === "NUMBER" ? data.unit : null,
      is_variant_axis: dataType === "ENUM" || dataType === "TEXT" ? data.isVariantAxis : false,
    },
    input,
    context.tenant.id,
    "Característica criada.",
  );
}

export async function saveAttributeOptionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const context = await writableContext();
  if (!context) return forbidden();
  const input = formDataToObject(formData);
  const parsed = attributeOptionSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const { id, attributeId, label, isActive } = parsed.data;

  if (id) {
    return persist(
      "product_attribute_options",
      id,
      { label, is_active: isActive },
      input,
      context.tenant.id,
      "Opção atualizada.",
    );
  }

  const code = parsed.data.code || toCode(label);
  if (!code) return { status: "error", message: "Informe um rótulo com letras ou números." };
  return persist(
    "product_attribute_options",
    null,
    { attribute_id: attributeId, code, label, is_active: true },
    input,
    context.tenant.id,
    "Opção adicionada.",
  );
}

const DELETE_MESSAGES: Record<Entity, string> = {
  categories: "Categoria excluída.",
  brands: "Marca excluída.",
  suppliers: "Fornecedor excluído.",
  product_attributes: "Característica excluída.",
  product_attribute_options: "Opção excluída.",
};

export async function deleteTaxonomyItemAction(entity: Entity, id: string): Promise<ActionState> {
  const context = await writableContext();
  if (!context) return forbidden();
  if (!Object.hasOwn(DELETE_MESSAGES, entity) || !idSchema.safeParse(id).success) {
    return { status: "error", message: GENERIC_ERROR_MESSAGE };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(entity)
    .delete()
    .eq("id", id)
    .eq("tenant_id", context.tenant.id)
    .select("id");

  if (error || !data?.length) {
    logger.warn({ event: `${entity}.delete`, status: "error", tenant_id: context.tenant.id, code: error?.code });
    return { status: "error", message: error ? toUserMessage(error) : toUserMessage({ message: "not_found" }) };
  }
  return done(DELETE_MESSAGES[entity]);
}
