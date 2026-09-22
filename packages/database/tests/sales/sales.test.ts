import { beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";
import { createProduct, key, stockOf } from "../helpers/catalog";

describe("sales (PDV)", () => {
  const db = useTestDatabase();
  let tenantId: string;
  let ownerId: string;
  let sellerId: string;
  let customerId: string;

  beforeAll(async () => {
    const owner = await db.createTenantWithOwner("Gorila Suplementos");
    tenantId = owner.tenantId;
    ownerId = owner.ownerId;
    sellerId = await db.addActiveMember(tenantId, "VENDEDOR");

    const [row] = await db
      .as(ownerId)
      .query<{ id: string }>("insert into public.customers (tenant_id, name, phone) values ($1, $2, $3) returning id", [
        tenantId,
        "Cliente Venda",
        "11977776666",
      ]);
    customerId = row!.id;
  });

  async function stockedVariant(
    quantity: number,
    name = "Produto Venda",
    salePrice = 100,
    costPrice: number | null = 40,
  ) {
    const { variantId } = await createProduct(db, ownerId, tenantId, {
      name,
      salePrice,
      costPrice: costPrice ?? undefined,
    });
    await db
      .as(ownerId)
      .rpc("inventory_register_entry", { p_variant_id: variantId, p_quantity: quantity, p_idempotency_key: key() });
    return variantId;
  }

  it("creates a confirmed sale, reduces physical stock and snapshots price/cost", async () => {
    const variantId = await stockedVariant(10, "Venda Simples", 150, 60);
    const [row] = await db.as(sellerId).rpc<{ sale_create: string }>("sale_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 3 }]),
      p_payment_method: "pix",
      p_paid_amount: 450,
    });
    const saleId = row!.sale_create;

    const stock = await stockOf(db, variantId);
    expect(stock.physical).toBe(7);
    expect(stock.reserved).toBe(0);

    const [sale] = await db
      .as(ownerId)
      .query<{ subtotal: string; total: string }>("select subtotal, total from public.sales where id = $1", [saleId]);
    expect(Number(sale!.subtotal)).toBe(450);
    expect(Number(sale!.total)).toBe(450);

    const [item] = await db
      .as(ownerId)
      .query<{ unit_price: string; unit_cost: string | null }>(
        "select unit_price, unit_cost from public.sale_items where sale_id = $1",
        [saleId],
      );
    expect(Number(item!.unit_price)).toBe(150);
    expect(Number(item!.unit_cost)).toBe(60);
  });

  it("never trusts a client-supplied price", async () => {
    const variantId = await stockedVariant(5, "Preço Real", 80);
    const [row] = await db.as(sellerId).rpc<{ sale_create: string }>("sale_create", {
      p_tenant_id: tenantId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 1, unit_price: 1 }]),
    });
    const [item] = await db
      .as(ownerId)
      .query<{ unit_price: string }>("select unit_price from public.sale_items where sale_id = $1", [row!.sale_create]);
    expect(Number(item!.unit_price)).toBe(80);
  });

  it("rejects duplicate variants in the same cart", async () => {
    const variantId = await stockedVariant(10, "Item Duplicado");
    await expect(
      db.as(sellerId).rpc("sale_create", {
        p_tenant_id: tenantId,
        p_items: JSON.stringify([
          { variant_id: variantId, quantity: 1 },
          { variant_id: variantId, quantity: 2 },
        ]),
      }),
    ).rejects.toThrow("invalid_input");
  });

  it("VENDEDOR cannot apply a discount without sales.discount", async () => {
    const variantId = await stockedVariant(10, "Sem Desconto");
    await expect(
      db.as(sellerId).rpc("sale_create", {
        p_tenant_id: tenantId,
        p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
        p_discount_amount: 10,
      }),
    ).rejects.toThrow("forbidden");
  });

  it("OWNER can apply a discount and total reflects it", async () => {
    const variantId = await stockedVariant(10, "Com Desconto", 100);
    const [row] = await db.as(ownerId).rpc<{ sale_create: string }>("sale_create", {
      p_tenant_id: tenantId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 2 }]),
      p_discount_amount: 30,
    });
    const [sale] = await db
      .as(ownerId)
      .query<{ subtotal: string; discount_amount: string; total: string }>(
        "select subtotal, discount_amount, total from public.sales where id = $1",
        [row!.sale_create],
      );
    expect(Number(sale!.subtotal)).toBe(200);
    expect(Number(sale!.discount_amount)).toBe(30);
    expect(Number(sale!.total)).toBe(170);
  });

  it("rejects a discount larger than the subtotal", async () => {
    const variantId = await stockedVariant(10, "Desconto Excessivo", 50);
    await expect(
      db.as(ownerId).rpc("sale_create", {
        p_tenant_id: tenantId,
        p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
        p_discount_amount: 999,
      }),
    ).rejects.toThrow("invalid_input");
  });

  it("respects FEFO and skips expired lots", async () => {
    const { productId, variantId } = await createProduct(db, ownerId, tenantId, {
      name: "Venda FEFO",
      salePrice: 20,
      trackLots: true,
    });
    void productId;
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 5);
    const later = new Date();
    later.setUTCDate(later.getUTCDate() + 60);
    await db.as(ownerId).rpc("inventory_register_entry", {
      p_variant_id: variantId,
      p_quantity: 5,
      p_idempotency_key: key(),
      p_lot_code: "FEFO-LATER",
      p_expires_on: later.toISOString().slice(0, 10),
    });
    await db.as(ownerId).rpc("inventory_register_entry", {
      p_variant_id: variantId,
      p_quantity: 5,
      p_idempotency_key: key(),
      p_lot_code: "FEFO-SOON",
      p_expires_on: soon.toISOString().slice(0, 10),
    });

    await db.as(sellerId).rpc("sale_create", {
      p_tenant_id: tenantId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 3 }]),
    });

    const lots = await db.admin.query<{ lot_code: string; quantity: string }>(
      "select lot_code, quantity from public.stock_lots where variant_id = $1 order by lot_code",
      [variantId],
    );
    const soonLot = lots.find((l) => l.lot_code === "FEFO-SOON")!;
    const laterLot = lots.find((l) => l.lot_code === "FEFO-LATER")!;
    expect(Number(soonLot.quantity)).toBe(2); // 5 - 3 consumidas primeiro (vence antes)
    expect(Number(laterLot.quantity)).toBe(5); // intocado
  });

  it("is idempotent: repeating the same key returns the same sale without double-selling", async () => {
    const variantId = await stockedVariant(10, "Idempotente Venda");
    const idempotencyKey = key();
    const [first] = await db.as(sellerId).rpc<{ sale_create: string }>("sale_create", {
      p_tenant_id: tenantId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 4 }]),
      p_idempotency_key: idempotencyKey,
    });
    const [second] = await db.as(sellerId).rpc<{ sale_create: string }>("sale_create", {
      p_tenant_id: tenantId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 4 }]),
      p_idempotency_key: idempotencyKey,
    });
    expect(second!.sale_create).toBe(first!.sale_create);
    const stock = await stockOf(db, variantId);
    expect(stock.physical).toBe(6);
  });

  it("cancels a sale by returning the stock and never deletes the row", async () => {
    const variantId = await stockedVariant(10, "Cancelar Venda");
    const [row] = await db.as(sellerId).rpc<{ sale_create: string }>("sale_create", {
      p_tenant_id: tenantId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 4 }]),
    });
    const saleId = row!.sale_create;

    await db.as(sellerId).rpc("sale_cancel", { p_sale_id: saleId, p_reason: "Cliente devolveu" });

    const stock = await stockOf(db, variantId);
    expect(stock.physical).toBe(10);

    const [sale] = await db
      .as(ownerId)
      .query<{ canceled_at: string | null; canceled_reason: string }>(
        "select canceled_at, canceled_reason from public.sales where id = $1",
        [saleId],
      );
    expect(sale!.canceled_at).not.toBeNull();
    expect(sale!.canceled_reason).toBe("Cliente devolveu");
  });

  it("cancels a sale of a lot-tracked product, returning stock to the exact originating lot(s)", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId, {
      name: "Cancelar Lote",
      salePrice: 30,
      trackLots: true,
    });
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 10);
    const later = new Date();
    later.setUTCDate(later.getUTCDate() + 90);
    await db.as(ownerId).rpc("inventory_register_entry", {
      p_variant_id: variantId,
      p_quantity: 3,
      p_idempotency_key: key(),
      p_lot_code: "CANCEL-SOON",
      p_expires_on: soon.toISOString().slice(0, 10),
    });
    await db.as(ownerId).rpc("inventory_register_entry", {
      p_variant_id: variantId,
      p_quantity: 5,
      p_idempotency_key: key(),
      p_lot_code: "CANCEL-LATER",
      p_expires_on: later.toISOString().slice(0, 10),
    });

    // FEFO consome as 3 unidades do lote que vence antes e 2 do que vence depois.
    const [row] = await db.as(sellerId).rpc<{ sale_create: string }>("sale_create", {
      p_tenant_id: tenantId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 5 }]),
    });
    const saleId = row!.sale_create;

    let lots = await db.admin.query<{ lot_code: string; quantity: string }>(
      "select lot_code, quantity from public.stock_lots where variant_id = $1 order by lot_code",
      [variantId],
    );
    expect(Number(lots.find((l) => l.lot_code === "CANCEL-SOON")!.quantity)).toBe(0);
    expect(Number(lots.find((l) => l.lot_code === "CANCEL-LATER")!.quantity)).toBe(3);

    await db.as(sellerId).rpc("sale_cancel", { p_sale_id: saleId, p_reason: "Estorno" });

    lots = await db.admin.query<{ lot_code: string; quantity: string }>(
      "select lot_code, quantity from public.stock_lots where variant_id = $1 order by lot_code",
      [variantId],
    );
    expect(Number(lots.find((l) => l.lot_code === "CANCEL-SOON")!.quantity)).toBe(3);
    expect(Number(lots.find((l) => l.lot_code === "CANCEL-LATER")!.quantity)).toBe(5);

    const stock = await stockOf(db, variantId);
    expect(stock.physical).toBe(8);
  });

  it("cannot cancel an already canceled sale", async () => {
    const variantId = await stockedVariant(10, "Duplo Cancelamento Venda");
    const [row] = await db.as(sellerId).rpc<{ sale_create: string }>("sale_create", {
      p_tenant_id: tenantId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
    });
    await db.as(sellerId).rpc("sale_cancel", { p_sale_id: row!.sale_create });
    await expect(db.as(sellerId).rpc("sale_cancel", { p_sale_id: row!.sale_create })).rejects.toThrow("invalid_input");
  });

  it("moves a linked CRM opportunity to the won stage when confirmed", async () => {
    const variantId = await stockedVariant(10, "Venda com CRM");
    const [opp] = await db.as(ownerId).rpc<{ crm_create_opportunity: string }>("crm_create_opportunity", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
    });
    await db.as(sellerId).rpc("sale_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
      p_opportunity_id: opp!.crm_create_opportunity,
    });

    const [row] = await db.as(ownerId).query<{ is_won: boolean }>(
      `select s.is_won from public.crm_opportunities o
         join public.crm_stages s on s.id = o.stage_id
         where o.id = $1`,
      [opp!.crm_create_opportunity],
    );
    expect(row!.is_won).toBe(true);
  });

  it("emits a customer timeline event when a sale is confirmed", async () => {
    const variantId = await stockedVariant(10, "Timeline Venda");
    const [row] = await db.as(sellerId).rpc<{ sale_create: string }>("sale_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
    });
    const events = await db
      .as(ownerId)
      .query<{ type: string }>(
        "select type from public.timeline_events where customer_id = $1 and payload->>'sale_id' = $2",
        [customerId, row!.sale_create],
      );
    expect(events.map((e) => e.type)).toEqual(["sale.completed"]);
  });

  it("customer_stats reflects real, non-canceled sales (Fase 4 replaces the Fase 3 zeroed view)", async () => {
    const [row] = await db
      .as(ownerId)
      .query<{ id: string }>("insert into public.customers (tenant_id, name, phone) values ($1, $2, $3) returning id", [
        tenantId,
        "Cliente Stats",
        "11955554444",
      ]);
    const statsCustomerId = row!.id;

    const variantA = await stockedVariant(10, "Stats Produto A", 100);
    const variantB = await stockedVariant(10, "Stats Produto B", 50);

    await db.as(sellerId).rpc("sale_create", {
      p_tenant_id: tenantId,
      p_customer_id: statsCustomerId,
      p_items: JSON.stringify([{ variant_id: variantA, quantity: 1 }]),
    });
    const [row2] = await db.as(sellerId).rpc<{ sale_create: string }>("sale_create", {
      p_tenant_id: tenantId,
      p_customer_id: statsCustomerId,
      p_items: JSON.stringify([{ variant_id: variantB, quantity: 1 }]),
    });
    // Uma venda cancelada não deve contar nas métricas.
    const canceledSale = await db.as(sellerId).rpc<{ sale_create: string }>("sale_create", {
      p_tenant_id: tenantId,
      p_customer_id: statsCustomerId,
      p_items: JSON.stringify([{ variant_id: variantA, quantity: 1 }]),
    });
    await db.as(sellerId).rpc("sale_cancel", { p_sale_id: canceledSale[0]!.sale_create });
    void row2;

    const [stats] = await db
      .as(ownerId)
      .query<{ total_spent: string; purchase_count: string; average_ticket: string; last_purchase_at: string }>(
        "select total_spent, purchase_count, average_ticket, last_purchase_at from public.customer_stats where customer_id = $1",
        [statsCustomerId],
      );
    expect(Number(stats!.total_spent)).toBe(150);
    expect(Number(stats!.purchase_count)).toBe(2);
    expect(Number(stats!.average_ticket)).toBe(75);
    expect(stats!.last_purchase_at).not.toBeNull();
  });

  it("rejects a reference to a variant from another tenant", async () => {
    const other = await db.createTenantWithOwner("Outra Loja");
    const { variantId: otherVariant } = await createProduct(db, other.ownerId, other.tenantId, { name: "Alheio" });
    await expect(
      db.as(sellerId).rpc("sale_create", {
        p_tenant_id: tenantId,
        p_items: JSON.stringify([{ variant_id: otherVariant, quantity: 1 }]),
      }),
    ).rejects.toThrow("not_found");
  });
});
