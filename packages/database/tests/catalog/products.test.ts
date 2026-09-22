import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useTestDatabase } from "../../src/harness/test-db";
import { createProduct, key, stockOf } from "../helpers/catalog";

describe("products and variants", () => {
  const db = useTestDatabase();
  let a: { tenantId: string; ownerId: string };
  let b: { tenantId: string; ownerId: string };
  let sellerA: string;
  let managerA: string;

  beforeAll(async () => {
    a = await db.createTenantWithOwner("Gorila Suplementos");
    b = await db.createTenantWithOwner("Loja B");
    sellerA = await db.addActiveMember(a.tenantId, "VENDEDOR");
    managerA = await db.addActiveMember(a.tenantId, "GERENTE");
  });

  it("creates product with default variant and zeroed stock atomically", async () => {
    const { productId, variantId } = await createProduct(db, a.ownerId, a.tenantId, {
      name: "Whey Isolado 900g",
      salePrice: 159.9,
      sku: "WHY-ISO-900",
      barcode: "7890000000011",
    });

    const [variant] = await db
      .as(sellerA)
      .query<{ name: string; sku: string; is_default: boolean }>(
        "select name, sku, is_default from public.product_variants where product_id = $1",
        [productId],
      );
    expect(variant).toEqual({ name: "Padrão", sku: "WHY-ISO-900", is_default: true });
    expect(await stockOf(db, variantId)).toEqual({ physical: 0, reserved: 0, available: 0 });

    const audit = await db.admin.query(
      "select id from public.audit_logs where action = 'product.created' and entity_id = $1",
      [productId],
    );
    expect(audit).toHaveLength(1);
  });

  it("keeps SKU and barcode unique per tenant but allows the same code in another tenant", async () => {
    await createProduct(db, a.ownerId, a.tenantId, { sku: "CRE-300", barcode: "7890000000028" });
    await expectDbError(createProduct(db, a.ownerId, a.tenantId, { sku: "cre-300" }), "sku_taken");
    await expectDbError(createProduct(db, a.ownerId, a.tenantId, { barcode: "7890000000028" }), "barcode_taken");
    await createProduct(db, b.ownerId, b.tenantId, { sku: "CRE-300", barcode: "7890000000028" });
  });

  it("rejects references to another tenant's taxonomy", async () => {
    const [foreignCategory] = await db
      .as(b.ownerId)
      .query<{ id: string }>("insert into public.categories (tenant_id, name) values ($1, 'B') returning id", [
        b.tenantId,
      ]);
    await expectDbError(
      createProduct(db, a.ownerId, a.tenantId, { categoryId: foreignCategory!.id }),
      "invalid_reference",
    );
  });

  it("validates promotional price below sale price", async () => {
    await expectDbError(createProduct(db, a.ownerId, a.tenantId, { salePrice: 100, promoPrice: 100 }), "invalid_input");
  });

  it("sellers read catalog but cannot write it nor see costs", async () => {
    const { productId, variantId } = await createProduct(db, a.ownerId, a.tenantId, { costPrice: 80 });

    expect(await db.as(sellerA).query("select id from public.products where id = $1", [productId])).toHaveLength(1);
    expect(
      await db
        .as(sellerA)
        .query("select cost_price from public.product_variant_costs where variant_id = $1", [variantId]),
    ).toHaveLength(0);
    const [managerCost] = await db
      .as(managerA)
      .query<{ cost_price: string }>("select cost_price from public.product_variant_costs where variant_id = $1", [
        variantId,
      ]);
    expect(Number(managerCost!.cost_price)).toBe(80);

    await expectDbError(createProduct(db, sellerA, a.tenantId), "forbidden");
    await expectDbError(
      db.as(sellerA).query("update public.products set sale_price = 1 where id = $1", [productId]),
      /permission denied/,
    );
  });

  it("isolates products between tenants", async () => {
    const { productId } = await createProduct(db, b.ownerId, b.tenantId);
    expect(await db.as(a.ownerId).query("select id from public.products where id = $1", [productId])).toHaveLength(0);
    await expectDbError(
      db.as(a.ownerId).rpc("catalog_update_product", { p_product_id: productId, p_name: "Hack", p_sale_price: 1 }),
      "forbidden",
    );
  });

  it("updates simple products including default variant codes and audits price changes", async () => {
    const { productId, variantId } = await createProduct(db, a.ownerId, a.tenantId, { salePrice: 50, sku: "OLD-1" });
    await db.as(managerA).rpc("catalog_update_product", {
      p_product_id: productId,
      p_name: "Barra de proteína",
      p_sale_price: 12.9,
      p_sku: "BAR-001",
      p_cost_price: 7.5,
      p_update_cost: true,
    });

    const [variant] = await db.admin.query<{ sku: string }>("select sku from public.product_variants where id = $1", [
      variantId,
    ]);
    expect(variant!.sku).toBe("BAR-001");

    const [audit] = await db.admin.query<{ before: { sale_price: number }; after: { sale_price: number } }>(
      "select before, after from public.audit_logs where action = 'product.updated' and entity_id = $1",
      [productId],
    );
    expect(audit!.before.sale_price).toBe(50);
    expect(audit!.after.sale_price).toBe(12.9);
  });

  it("does not toggle lot tracking or archive while there is stock", async () => {
    const { productId, variantId } = await createProduct(db, a.ownerId, a.tenantId);
    await db.as(a.ownerId).rpc("inventory_register_entry", {
      p_variant_id: variantId,
      p_quantity: 3,
      p_idempotency_key: key(),
    });

    await expectDbError(
      db.as(a.ownerId).rpc("catalog_update_product", {
        p_product_id: productId,
        p_name: "Com lote",
        p_sale_price: 100,
        p_track_lots: true,
      }),
      "product_has_stock",
    );
    await expectDbError(
      db.as(a.ownerId).rpc("catalog_archive_product", { p_product_id: productId }),
      "product_has_stock",
    );
  });

  it("archives products without stock and hides them from views", async () => {
    const { productId } = await createProduct(db, a.ownerId, a.tenantId, { sku: "ARCH-1" });
    await db.as(a.ownerId).rpc("catalog_archive_product", { p_product_id: productId });
    expect(
      await db
        .as(a.ownerId)
        .query("select variant_id from public.product_variant_details where product_id = $1", [productId]),
    ).toHaveLength(0);
    // SKU liberado após arquivamento
    await createProduct(db, a.ownerId, a.tenantId, { sku: "ARCH-1" });
  });

  describe("variants", () => {
    it("adding a variant turns the product into a variant product", async () => {
      const { productId } = await createProduct(db, a.ownerId, a.tenantId, { salePrice: 150 });
      const [row] = await db.as(a.ownerId).rpc<{ catalog_upsert_variant: string }>("catalog_upsert_variant", {
        p_product_id: productId,
        p_name: "Morango",
        p_sku: "WHY-MOR",
      });
      expect(row!.catalog_upsert_variant).toBeTruthy();
      const [product] = await db.admin.query<{ has_variants: boolean }>(
        "select has_variants from public.products where id = $1",
        [productId],
      );
      expect(product!.has_variants).toBe(true);
    });

    it("resolves effective prices: variant price does not inherit product promotion", async () => {
      const { productId } = await createProduct(db, a.ownerId, a.tenantId, { salePrice: 150, promoPrice: 139.9 });
      await db.as(a.ownerId).rpc("catalog_upsert_variant", { p_product_id: productId, p_name: "Chocolate" });
      await db.as(a.ownerId).rpc("catalog_upsert_variant", {
        p_product_id: productId,
        p_name: "Premium",
        p_sale_price: 180,
      });

      const rows = await db.as(sellerA).query<{
        name: string;
        effective_sale_price: string;
        effective_promo_price: string | null;
        current_price: string;
      }>(
        `select name, effective_sale_price, effective_promo_price, current_price
           from public.product_variant_details where product_id = $1 order by name`,
        [productId],
      );
      const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
      expect(Number(byName.Chocolate!.current_price)).toBe(139.9);
      expect(byName.Premium!.effective_promo_price).toBeNull();
      expect(Number(byName.Premium!.current_price)).toBe(180);
    });

    it("rejects variant promotion above its effective price and protects the last variant", async () => {
      const { productId, variantId } = await createProduct(db, a.ownerId, a.tenantId, { salePrice: 100 });
      await expectDbError(
        db.as(a.ownerId).rpc("catalog_upsert_variant", { p_product_id: productId, p_name: "X", p_promo_price: 120 }),
        "invalid_input",
      );
      await expectDbError(db.as(a.ownerId).rpc("catalog_archive_variant", { p_variant_id: variantId }), "last_variant");
    });

    it("archiving the default variant promotes another one", async () => {
      // SKU customizado impede o arquivamento automático (ver bloco abaixo),
      // isolando aqui o comportamento manual de catalog_archive_variant.
      const { productId, variantId } = await createProduct(db, a.ownerId, a.tenantId, { sku: "ORIGINAL-SKU" });
      const [row] = await db.as(a.ownerId).rpc<{ catalog_upsert_variant: string }>("catalog_upsert_variant", {
        p_product_id: productId,
        p_name: "Baunilha",
      });
      await db.as(a.ownerId).rpc("catalog_archive_variant", { p_variant_id: variantId });
      const [promoted] = await db.admin.query<{ is_default: boolean }>(
        "select is_default from public.product_variants where id = $1",
        [row!.catalog_upsert_variant],
      );
      expect(promoted!.is_default).toBe(true);
    });

    describe("automatic archiving of the untouched default variant", () => {
      it("archives it when the first named variant is created", async () => {
        const { productId, variantId } = await createProduct(db, a.ownerId, a.tenantId);
        const [row] = await db.as(a.ownerId).rpc<{ catalog_upsert_variant: string }>("catalog_upsert_variant", {
          p_product_id: productId,
          p_name: "Chocolate",
        });
        const variants = await db.admin.query<{ id: string; is_default: boolean; archived_at: string | null }>(
          "select id, is_default, archived_at from public.product_variants where product_id = $1",
          [productId],
        );
        const original = variants.find((variant) => variant.id === variantId)!;
        const promoted = variants.find((variant) => variant.id === row!.catalog_upsert_variant)!;
        expect(original.archived_at).not.toBeNull();
        expect(original.is_default).toBe(false);
        expect(promoted.is_default).toBe(true);
        expect(promoted.archived_at).toBeNull();
      });

      it("keeps it when it already has stock", async () => {
        const { productId, variantId } = await createProduct(db, a.ownerId, a.tenantId);
        await db.as(a.ownerId).rpc("inventory_register_entry", {
          p_variant_id: variantId,
          p_quantity: 1,
          p_idempotency_key: key(),
        });
        await db.as(a.ownerId).rpc("catalog_upsert_variant", { p_product_id: productId, p_name: "Chocolate" });
        const [original] = await db.admin.query<{ is_default: boolean; archived_at: string | null }>(
          "select is_default, archived_at from public.product_variants where id = $1",
          [variantId],
        );
        expect(original!.archived_at).toBeNull();
        expect(original!.is_default).toBe(true);
      });

      it("keeps it when it was already given a SKU", async () => {
        const { productId, variantId } = await createProduct(db, a.ownerId, a.tenantId, { sku: "CUSTOM-1" });
        await db.as(a.ownerId).rpc("catalog_upsert_variant", { p_product_id: productId, p_name: "Chocolate" });
        const [original] = await db.admin.query<{ is_default: boolean; archived_at: string | null }>(
          "select is_default, archived_at from public.product_variants where id = $1",
          [variantId],
        );
        expect(original!.archived_at).toBeNull();
        expect(original!.is_default).toBe(true);
      });
    });

    it("blocks price updates that would invalidate inherited variant promotions", async () => {
      const { productId } = await createProduct(db, a.ownerId, a.tenantId, { salePrice: 100 });
      await db
        .as(a.ownerId)
        .rpc("catalog_upsert_variant", { p_product_id: productId, p_name: "Promo", p_promo_price: 90 });
      await expectDbError(
        db.as(a.ownerId).rpc("catalog_update_product", { p_product_id: productId, p_name: "P", p_sale_price: 80 }),
        "invalid_input",
      );
    });
  });

  describe("search", () => {
    let categoryRoot: string;
    let shop: { tenantId: string; ownerId: string };

    beforeAll(async () => {
      shop = await db.createTenantWithOwner("Loja Busca");
      const [root] = await db
        .as(shop.ownerId)
        .query<{ id: string }>(
          "insert into public.categories (tenant_id, name) values ($1, 'Suplementos') returning id",
          [shop.tenantId],
        );
      const [child] = await db
        .as(shop.ownerId)
        .query<{ id: string }>(
          "insert into public.categories (tenant_id, name, parent_id) values ($1, 'Proteínas', $2) returning id",
          [shop.tenantId, root!.id],
        );
      categoryRoot = root!.id;
      const [brand] = await db
        .as(shop.ownerId)
        .query<{ id: string }>("insert into public.brands (tenant_id, name) values ($1, 'Max Titanium') returning id", [
          shop.tenantId,
        ]);

      const whey = await createProduct(db, shop.ownerId, shop.tenantId, {
        name: "Whey Protéico Açaí",
        salePrice: 120,
        categoryId: child!.id,
        brandId: brand!.id,
        sku: "WHEY-ACAI",
        minStock: 5,
      });
      await db.as(shop.ownerId).rpc("inventory_register_entry", {
        p_variant_id: whey.variantId,
        p_quantity: 3,
        p_idempotency_key: key(),
      });
      await createProduct(db, shop.ownerId, shop.tenantId, {
        name: "Creatina",
        salePrice: 90,
        barcode: "7891112223334",
      });
    });

    async function search(params: Record<string, unknown>) {
      const rows = await db
        .as(shop.ownerId)
        .rpc<{ name: string; stock_status: string; total_count: string }>("catalog_search_products", {
          p_tenant_id: shop.tenantId,
          ...params,
        });
      return rows;
    }

    it("matches name without accents, brand, sku and barcode", async () => {
      expect((await search({ p_query: "proteico acai" })).map((row) => row.name)).toEqual(["Whey Protéico Açaí"]);
      expect((await search({ p_query: "titanium" })).map((row) => row.name)).toEqual(["Whey Protéico Açaí"]);
      expect((await search({ p_query: "whey-acai" })).map((row) => row.name)).toEqual(["Whey Protéico Açaí"]);
      expect((await search({ p_query: "7891112223334" })).map((row) => row.name)).toEqual(["Creatina"]);
      expect(await search({ p_query: "100%" })).toHaveLength(0);
    });

    it("filters by category tree and stock status", async () => {
      expect((await search({ p_category_id: categoryRoot })).map((row) => row.name)).toEqual(["Whey Protéico Açaí"]);
      expect((await search({ p_stock_status: "LOW" })).map((row) => row.name)).toEqual(["Whey Protéico Açaí"]);
      expect((await search({ p_stock_status: "OUT" })).map((row) => row.name)).toEqual(["Creatina"]);
      const all = await search({});
      expect(Number(all[0]!.total_count)).toBe(2);
    });

    it("ranks exact barcode first in variant lookup", async () => {
      const rows = await db.as(shop.ownerId).rpc<{ product_name: string }>("catalog_lookup_variants", {
        p_tenant_id: shop.tenantId,
        p_query: "7891112223334",
      });
      expect(rows[0]!.product_name).toBe("Creatina");
    });
  });
});
