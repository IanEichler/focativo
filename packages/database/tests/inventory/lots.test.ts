import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useTestDatabase } from "../../src/harness/test-db";
import { createProduct, isoDate, key, lotsOf, stockOf } from "../helpers/catalog";

describe("lots, expiration and FEFO", () => {
  const db = useTestDatabase();
  let tenantId: string;
  let ownerId: string;

  beforeAll(async () => {
    ({ tenantId, ownerId } = await db.createTenantWithOwner("Gorila Suplementos"));
  });

  const entryLot = (variantId: string, quantity: number, lotCode: string, expiresOn?: string) =>
    db.as(ownerId).rpc("inventory_register_entry", {
      p_variant_id: variantId,
      p_quantity: quantity,
      p_idempotency_key: key(),
      p_lot_code: lotCode,
      p_expires_on: expiresOn ?? null,
    });

  /** Lotes vencidos só existem por passagem do tempo; o cenário é preparado direto no banco. */
  async function backdateLot(variantId: string, lotCode: string, expiresOn: string) {
    await db.admin.query("update public.stock_lots set expires_on = $1 where variant_id = $2 and lot_code = $3", [
      expiresOn,
      variantId,
      lotCode,
    ]);
  }

  it("lot-tracked products require a lot on entry; others reject lots", async () => {
    const tracked = await createProduct(db, ownerId, tenantId, { trackLots: true });
    await expectDbError(
      db.as(ownerId).rpc("inventory_register_entry", {
        p_variant_id: tracked.variantId,
        p_quantity: 1,
        p_idempotency_key: key(),
      }),
      "lot_required",
    );

    const plain = await createProduct(db, ownerId, tenantId);
    await expectDbError(entryLot(plain.variantId, 1, "L1", isoDate(100)), "lots_not_tracked");
  });

  it("accumulates the same lot code and rejects conflicting expiration", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId, { trackLots: true });
    await entryLot(variantId, 5, "L-2027", isoDate(200));
    await entryLot(variantId, 3, "l-2027", isoDate(200));
    expect(await lotsOf(db, variantId)).toEqual([{ code: "L-2027", quantity: 8, expiresOn: isoDate(200) }]);
    await expectDbError(entryLot(variantId, 1, "L-2027", isoDate(300)), "lot_mismatch");
    await expectDbError(entryLot(variantId, 1, "VENCIDO", isoDate(-1)), "lot_expired");
  });

  it("allocates losses FEFO and keeps lots in sync with physical stock", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId, { trackLots: true });
    await entryLot(variantId, 4, "LATE", isoDate(300));
    await entryLot(variantId, 3, "SOON", isoDate(30));
    await entryLot(variantId, 2, "NOEXP");

    await db.as(ownerId).rpc("inventory_register_loss", {
      p_variant_id: variantId,
      p_quantity: 5,
      p_reason: "Avaria no transporte",
      p_idempotency_key: key(),
    });

    expect(await lotsOf(db, variantId)).toEqual([
      { code: "SOON", quantity: 0, expiresOn: isoDate(30) },
      { code: "LATE", quantity: 2, expiresOn: isoDate(300) },
      { code: "NOEXP", quantity: 2, expiresOn: null },
    ]);
    expect((await stockOf(db, variantId)).physical).toBe(4);

    const allocations = await db.admin.query<{ lot_code: string; quantity_delta: string }>(
      `select l.lot_code, ml.quantity_delta
       from public.stock_movement_lots ml join public.stock_lots l on l.id = ml.lot_id
       join public.stock_movements m on m.id = ml.movement_id
       where m.variant_id = $1 and m.type = 'LOSS' order by l.expires_on`,
      [variantId],
    );
    expect(allocations.map((row) => [row.lot_code, Number(row.quantity_delta)])).toEqual([
      ["SOON", -3],
      ["LATE", -2],
    ]);
  });

  it("sales skip expired lots (FEFO over valid lots only)", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId, { trackLots: true });
    await entryLot(variantId, 2, "OLD", isoDate(10));
    await entryLot(variantId, 2, "NEW", isoDate(100));
    await backdateLot(variantId, "OLD", isoDate(-5));

    await db.admin.query(
      "select private.apply_stock_movement($1, $2, 'SALE', 2, 'SALE', p_skip_expired => true)",
      [tenantId, variantId],
    );
    expect(await lotsOf(db, variantId)).toEqual([
      { code: "OLD", quantity: 2, expiresOn: isoDate(-5) },
      { code: "NEW", quantity: 0, expiresOn: isoDate(100) },
    ]);

    await expectDbError(
      db.admin.query("select private.apply_stock_movement($1, $2, 'SALE', 1, 'SALE', p_skip_expired => true)", [
        tenantId,
        variantId,
      ]),
      "insufficient_stock",
    );
  });

  it("losses on a specific lot and counted adjustments per lot", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId, { trackLots: true });
    await entryLot(variantId, 5, "A", isoDate(60));
    await entryLot(variantId, 5, "B", isoDate(90));
    const [lotB] = await db.admin.query<{ id: string }>(
      "select id from public.stock_lots where variant_id = $1 and lot_code = 'B'",
      [variantId],
    );

    await expectDbError(
      db.as(ownerId).rpc("inventory_register_loss", {
        p_variant_id: variantId,
        p_quantity: 6,
        p_reason: "Vencido",
        p_lot_id: lotB!.id,
        p_idempotency_key: key(),
      }),
      "insufficient_lot_stock",
    );

    await db.as(ownerId).rpc("inventory_adjust_stock", {
      p_variant_id: variantId,
      p_counted_quantity: 2,
      p_reason: "Contagem do lote B",
      p_lot_code: "b",
      p_idempotency_key: key(),
    });
    await expectDbError(
      db.as(ownerId).rpc("inventory_adjust_stock", {
        p_variant_id: variantId,
        p_counted_quantity: 1,
        p_reason: "Sem lote",
        p_idempotency_key: key(),
      }),
      "lot_required",
    );

    expect(await lotsOf(db, variantId)).toEqual([
      { code: "A", quantity: 5, expiresOn: isoDate(60) },
      { code: "B", quantity: 2, expiresOn: isoDate(90) },
    ]);
    expect((await stockOf(db, variantId)).physical).toBe(7);
  });

  it("flags expiring and expired lots in overview and summary", async () => {
    const shop = await db.createTenantWithOwner("Loja Validade");
    const { variantId } = await createProduct(db, shop.ownerId, shop.tenantId, { trackLots: true });
    const entry = (code: string, expiresOn: string) =>
      db.as(shop.ownerId).rpc("inventory_register_entry", {
        p_variant_id: variantId,
        p_quantity: 1,
        p_idempotency_key: key(),
        p_lot_code: code,
        p_expires_on: expiresOn,
      });
    await entry("EXPIRED", isoDate(5));
    await entry("EXPIRING", isoDate(10));
    await entry("FAR", isoDate(200));
    await backdateLot(variantId, "EXPIRED", isoDate(-2));

    const lots = await db
      .as(shop.ownerId)
      .query<{ lot_code: string; expiry_status: string }>(
        "select lot_code, expiry_status from public.inventory_lot_overview where variant_id = $1 order by expires_on",
        [variantId],
      );
    expect(lots).toEqual([
      { lot_code: "EXPIRED", expiry_status: "EXPIRED" },
      { lot_code: "EXPIRING", expiry_status: "EXPIRING" },
      { lot_code: "FAR", expiry_status: "OK" },
    ]);

    const [overview] = await db
      .as(shop.ownerId)
      .query<{ next_expiration: string; expired_quantity: string; expiring_quantity: string }>(
        "select next_expiration::text, expired_quantity, expiring_quantity from public.inventory_variant_overview where variant_id = $1",
        [variantId],
      );
    expect(overview).toMatchObject({ next_expiration: isoDate(10) });
    expect(Number(overview!.expired_quantity)).toBe(1);
    expect(Number(overview!.expiring_quantity)).toBe(1);

    const [summary] = await db
      .as(shop.ownerId)
      .rpc<{ inventory_summary: Record<string, number> }>("inventory_summary", { p_tenant_id: shop.tenantId });
    expect(summary!.inventory_summary).toMatchObject({ expiring_lots: 1, expired_lots: 1, expiry_alert_days: 30 });
  });
});
