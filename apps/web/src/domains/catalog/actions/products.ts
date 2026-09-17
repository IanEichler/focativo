"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext, type TenantContext } from "@/domains/tenants/context";
import { GENERIC_ERROR_MESSAGE, toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { PRODUCT_IMAGE_MAX_BYTES, PRODUCT_IMAGE_TYPES, PRODUCT_IMAGES_BUCKET } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, safeFormValues, validationError } from "@/lib/validation";
import { productIdSchema, productSchema, variantSchema, type ProductField, type VariantField } from "../schemas";

const PRODUCTS_PATH = "/app/produtos";

function denied(context: TenantContext, event: string): ActionState<never> {
  logger.warn({ event, status: "denied", tenant_id: context.tenant.id, user_id: context.user.id });
  return { status: "error", message: toUserMessage({ message: "forbidden" }) };
}

function revalidateProduct(productId?: string) {
  revalidatePath(PRODUCTS_PATH);
  revalidatePath("/app/estoque");
  if (productId) revalidatePath(`${PRODUCTS_PATH}/${productId}`);
}

export async function saveProductAction(
  _prev: ActionState<ProductField>,
  formData: FormData,
): Promise<ActionState<ProductField>> {
  const context = await requireTenantContext();
  if (!context.can("catalog.write")) return denied(context, "product.save");

  const productId = formData.get("productId");
  const input = formDataToObject(formData);
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const data = parsed.data;
  const withCost = data.canEditCost && context.can("catalog.costs");
  const supabase = await createClient();

  if (typeof productId === "string" && productId) {
    const id = productIdSchema.safeParse(productId);
    if (!id.success) return { status: "error", message: GENERIC_ERROR_MESSAGE };

    const { error } = await supabase.rpc("catalog_update_product", {
      p_product_id: id.data,
      p_name: data.name,
      p_sale_price: data.salePrice,
      p_description: data.description ?? undefined,
      p_category_id: data.categoryId ?? undefined,
      p_brand_id: data.brandId ?? undefined,
      p_supplier_id: data.supplierId ?? undefined,
      p_unit: data.unit,
      p_promo_price: data.promoPrice ?? undefined,
      p_min_stock: data.minStock,
      p_is_active: data.isActive,
      p_track_lots: data.trackLots,
      p_sku: data.sku ?? undefined,
      p_barcode: data.barcode ?? undefined,
      p_cost_price: data.costPrice ?? undefined,
      p_update_cost: withCost,
    });
    if (error) {
      logger.warn({ event: "product.update", status: "error", tenant_id: context.tenant.id, code: error.message });
      return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
    }
    revalidateProduct(id.data);
    return { status: "success", message: "Produto atualizado.", id: id.data };
  }

  const { data: createdId, error } = await supabase.rpc("catalog_create_product", {
    p_tenant_id: context.tenant.id,
    p_name: data.name,
    p_sale_price: data.salePrice,
    p_description: data.description ?? undefined,
    p_category_id: data.categoryId ?? undefined,
    p_brand_id: data.brandId ?? undefined,
    p_supplier_id: data.supplierId ?? undefined,
    p_unit: data.unit,
    p_promo_price: data.promoPrice ?? undefined,
    p_min_stock: data.minStock,
    p_is_active: data.isActive,
    p_track_lots: data.trackLots,
    p_sku: data.sku ?? undefined,
    p_barcode: data.barcode ?? undefined,
    p_cost_price: withCost ? (data.costPrice ?? undefined) : undefined,
  });

  if (error || !createdId) {
    logger.warn({ event: "product.create", status: "error", tenant_id: context.tenant.id, code: error?.message });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }

  logger.info({ event: "product.create", status: "ok", tenant_id: context.tenant.id, user_id: context.user.id });
  revalidateProduct();
  return { status: "success", message: "Produto cadastrado.", id: createdId };
}

export async function setProductActiveAction(productId: string, active: boolean): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("catalog.write")) return denied(context, "product.set_active");
  const id = productIdSchema.safeParse(productId);
  if (!id.success) return { status: "error", message: GENERIC_ERROR_MESSAGE };

  const supabase = await createClient();
  const { error } = await supabase.rpc("catalog_set_product_active", { p_product_id: id.data, p_active: active });
  if (error) return { status: "error", message: toUserMessage(error) };

  revalidateProduct(id.data);
  return { status: "success", message: active ? "Produto ativado." : "Produto desativado." };
}

export async function archiveProductAction(productId: string): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("catalog.write")) return denied(context, "product.archive");
  const id = productIdSchema.safeParse(productId);
  if (!id.success) return { status: "error", message: GENERIC_ERROR_MESSAGE };

  const supabase = await createClient();
  const { error } = await supabase.rpc("catalog_archive_product", { p_product_id: id.data });
  if (error) return { status: "error", message: toUserMessage(error) };

  logger.info({ event: "product.archive", status: "ok", tenant_id: context.tenant.id, user_id: context.user.id });
  revalidateProduct(id.data);
  return { status: "success", message: "Produto arquivado." };
}

// -----------------------------------------------------------------------------
// Imagem
// -----------------------------------------------------------------------------

const EXTENSION: Record<(typeof PRODUCT_IMAGE_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function uploadProductImageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("catalog.write")) return denied(context, "product.image_upload");

  const id = productIdSchema.safeParse(formData.get("productId"));
  const file = formData.get("image");
  if (!id.success || !(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Selecione uma imagem." };
  }
  if (!PRODUCT_IMAGE_TYPES.includes(file.type as (typeof PRODUCT_IMAGE_TYPES)[number])) {
    return { status: "error", message: "Formato não suportado. Use JPG, PNG ou WebP." };
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    return { status: "error", message: "Imagem muito grande. O limite é 2 MB." };
  }

  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, image_path")
    .eq("id", id.data)
    .eq("tenant_id", context.tenant.id)
    .maybeSingle();
  if (!product) return { status: "error", message: toUserMessage({ message: "not_found" }) };

  const extension = EXTENSION[file.type as (typeof PRODUCT_IMAGE_TYPES)[number]];
  const path = `${context.tenant.id}/products/${product.id}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (uploadError) {
    logger.warn({ event: "product.image_upload", status: "error", tenant_id: context.tenant.id, reason: uploadError.name });
    return { status: "error", message: GENERIC_ERROR_MESSAGE };
  }

  const { error } = await supabase.rpc("catalog_set_product_image", { p_product_id: product.id, p_image_path: path });
  if (error) {
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
    return { status: "error", message: toUserMessage(error) };
  }

  if (product.image_path) {
    // Melhor esforço: a imagem antiga deixa de ser referenciada.
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([product.image_path]);
  }

  revalidateProduct(product.id);
  return { status: "success", message: "Imagem atualizada." };
}

export async function removeProductImageAction(productId: string): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("catalog.write")) return denied(context, "product.image_remove");
  const id = productIdSchema.safeParse(productId);
  if (!id.success) return { status: "error", message: GENERIC_ERROR_MESSAGE };

  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, image_path")
    .eq("id", id.data)
    .eq("tenant_id", context.tenant.id)
    .maybeSingle();
  if (!product) return { status: "error", message: toUserMessage({ message: "not_found" }) };

  const { error } = await supabase.rpc("catalog_set_product_image", { p_product_id: product.id });
  if (error) return { status: "error", message: toUserMessage(error) };
  if (product.image_path) await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([product.image_path]);

  revalidateProduct(product.id);
  return { status: "success", message: "Imagem removida." };
}

// -----------------------------------------------------------------------------
// Variantes
// -----------------------------------------------------------------------------

export async function saveVariantAction(
  _prev: ActionState<VariantField>,
  formData: FormData,
): Promise<ActionState<VariantField>> {
  const context = await requireTenantContext();
  if (!context.can("catalog.write")) return denied(context, "variant.save");

  const input = formDataToObject(formData);
  const parsed = variantSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);
  const data = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("catalog_upsert_variant", {
    p_product_id: data.productId,
    p_variant_id: data.variantId ?? undefined,
    p_name: data.name,
    p_sku: data.sku ?? undefined,
    p_barcode: data.barcode ?? undefined,
    p_sale_price: data.salePrice ?? undefined,
    p_promo_price: data.promoPrice ?? undefined,
    p_min_stock: data.minStock ?? undefined,
    p_is_active: data.isActive,
    p_cost_price: data.costPrice ?? undefined,
    p_update_cost: data.canEditCost && context.can("catalog.costs"),
  });

  if (error) {
    logger.warn({ event: "variant.save", status: "error", tenant_id: context.tenant.id, code: error.message });
    return { status: "error", message: toUserMessage(error), values: safeFormValues(input) };
  }

  revalidateProduct(data.productId);
  return { status: "success", message: data.variantId ? "Variação atualizada." : "Variação criada." };
}

export async function archiveVariantAction(productId: string, variantId: string): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("catalog.write")) return denied(context, "variant.archive");
  const product = productIdSchema.safeParse(productId);
  const variant = productIdSchema.safeParse(variantId);
  if (!product.success || !variant.success) return { status: "error", message: GENERIC_ERROR_MESSAGE };

  const supabase = await createClient();
  const { error } = await supabase.rpc("catalog_archive_variant", { p_variant_id: variant.data });
  if (error) return { status: "error", message: toUserMessage(error) };

  revalidateProduct(product.data);
  return { status: "success", message: "Variação arquivada." };
}
