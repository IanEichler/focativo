import { randomUUID } from "node:crypto";
import type { TestDatabase } from "../../src/harness/test-db";

export interface ProductInput {
  name?: string;
  salePrice?: number;
  promoPrice?: number | null;
  sku?: string | null;
  barcode?: string | null;
  trackLots?: boolean;
  minStock?: number;
  categoryId?: string | null;
  brandId?: string | null;
  costPrice?: number | null;
}

export async function createProduct(db: TestDatabase, userId: string, tenantId: string, input: ProductInput = {}) {
  const [row] = await db.as(userId).rpc<{ catalog_create_product: string }>("catalog_create_product", {
    p_tenant_id: tenantId,
    p_name: input.name ?? `Produto ${randomUUID().slice(0, 6)}`,
    p_sale_price: input.salePrice ?? 100,
    p_promo_price: input.promoPrice ?? null,
    p_sku: input.sku ?? null,
    p_barcode: input.barcode ?? null,
    p_track_lots: input.trackLots ?? false,
    p_min_stock: input.minStock ?? 0,
    p_category_id: input.categoryId ?? null,
    p_brand_id: input.brandId ?? null,
    p_cost_price: input.costPrice ?? null,
  });
  const productId = row!.catalog_create_product;
  const [variant] = await db.admin.query<{ id: string }>(
    "select id from public.product_variants where product_id = $1 and is_default",
    [productId],
  );
  return { productId, variantId: variant!.id };
}

export async function stockOf(db: TestDatabase, variantId: string) {
  const [row] = await db.admin.query<{ physical: string; reserved: string; available: string }>(
    `select physical_quantity as physical, reserved_quantity as reserved, available_quantity as available
     from public.stock_levels where variant_id = $1`,
    [variantId],
  );
  return { physical: Number(row!.physical), reserved: Number(row!.reserved), available: Number(row!.available) };
}

export async function lotsOf(db: TestDatabase, variantId: string) {
  const rows = await db.admin.query<{ lot_code: string; quantity: string; expires_on: string | null }>(
    "select lot_code, quantity, expires_on::text from public.stock_lots where variant_id = $1 order by expires_on nulls last",
    [variantId],
  );
  return rows.map((row) => ({ code: row.lot_code, quantity: Number(row.quantity), expiresOn: row.expires_on }));
}

export const key = () => `test-${randomUUID()}`;

export function isoDate(daysFromToday: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}
