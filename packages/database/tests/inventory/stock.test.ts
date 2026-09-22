import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useTestDatabase } from "../../src/harness/test-db";
import { createProduct, key, stockOf } from "../helpers/catalog";

describe("stock movements", () => {
  const db = useTestDatabase();
  let tenantId: string;
  let ownerId: string;
  let sellerId: string;
  let managerId: string;

  beforeAll(async () => {
    ({ tenantId, ownerId } = await db.createTenantWithOwner("Gorila Suplementos"));
    sellerId = await db.addActiveMember(tenantId, "VENDEDOR");
    managerId = await db.addActiveMember(tenantId, "GERENTE");
  });

  const entry = (userId: string, variantId: string, quantity: number, extra: Record<string, unknown> = {}) =>
    db.as(userId).rpc<{ inventory_register_entry: string }>("inventory_register_entry", {
      p_variant_id: variantId,
      p_quantity: quantity,
      p_idempotency_key: key(),
      ...extra,
    });

  const reserve = (variantId: string, quantity: number) =>
    db.admin.query("select private.apply_stock_movement($1, $2, 'RESERVATION', $3, 'RESERVATION')", [
      tenantId,
      variantId,
      quantity,
    ]);

  it("entry increases physical and available; ledger records snapshot and actor", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId);
    const [row] = await entry(managerId, variantId, 10, { p_unit_cost: 75.5, p_reason: "NF 123" });

    expect(await stockOf(db, variantId)).toEqual({ physical: 10, reserved: 0, available: 10 });
    const [movement] = await db
      .as(managerId)
      .query<{ type: string; physical_after: string; actor_user_id: string; unit_cost: string }>(
        "select type, physical_after, actor_user_id, unit_cost from public.stock_movements where id = $1",
        [row!.inventory_register_entry],
      );
    expect(movement).toMatchObject({ type: "ENTRY", actor_user_id: managerId });
    expect(Number(movement!.physical_after)).toBe(10);
    expect(Number(movement!.unit_cost)).toBe(75.5);
  });

  it("never allows negative stock", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId);
    await entry(ownerId, variantId, 2);
    await expectDbError(
      db.as(ownerId).rpc("inventory_register_loss", {
        p_variant_id: variantId,
        p_quantity: 3,
        p_reason: "Avaria",
        p_idempotency_key: key(),
      }),
      "insufficient_stock",
    );
    expect(await stockOf(db, variantId)).toEqual({ physical: 2, reserved: 0, available: 2 });
  });

  it("losses cannot consume reserved units and adjustments cannot go below reserved", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId);
    await entry(ownerId, variantId, 5);
    await reserve(variantId, 4);
    expect(await stockOf(db, variantId)).toEqual({ physical: 5, reserved: 4, available: 1 });

    await expectDbError(
      db.as(ownerId).rpc("inventory_register_loss", {
        p_variant_id: variantId,
        p_quantity: 2,
        p_reason: "Quebra",
        p_idempotency_key: key(),
      }),
      "insufficient_stock",
    );
    await expectDbError(
      db.as(ownerId).rpc("inventory_adjust_stock", {
        p_variant_id: variantId,
        p_counted_quantity: 3,
        p_reason: "Contagem",
        p_idempotency_key: key(),
      }),
      "below_reserved",
    );
  });

  it("adjusts to the counted quantity in both directions and audits it", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId);
    await entry(ownerId, variantId, 10);

    await db.as(managerId).rpc("inventory_adjust_stock", {
      p_variant_id: variantId,
      p_counted_quantity: 7,
      p_reason: "Inventário mensal",
      p_idempotency_key: key(),
    });
    expect((await stockOf(db, variantId)).physical).toBe(7);

    await db.as(managerId).rpc("inventory_adjust_stock", {
      p_variant_id: variantId,
      p_counted_quantity: 12.5,
      p_reason: "Recontagem",
      p_idempotency_key: key(),
    });
    expect((await stockOf(db, variantId)).physical).toBe(12.5);

    await expectDbError(
      db.as(managerId).rpc("inventory_adjust_stock", {
        p_variant_id: variantId,
        p_counted_quantity: 12.5,
        p_reason: "Sem diferença",
        p_idempotency_key: key(),
      }),
      "no_change",
    );

    const audit = await db.admin.query<{ action: string }>(
      "select action from public.audit_logs where action = 'inventory.adjustment' and metadata ->> 'variant_id' = $1",
      [variantId],
    );
    expect(audit).toHaveLength(2);
  });

  it("requires a reason for losses and adjustments", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId);
    await entry(ownerId, variantId, 1);
    await expectDbError(
      db.as(ownerId).rpc("inventory_register_loss", {
        p_variant_id: variantId,
        p_quantity: 1,
        p_reason: " ",
        p_idempotency_key: key(),
      }),
      "invalid_input",
    );
  });

  it("idempotency key replays without applying twice and rejects conflicting reuse", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId);
    const other = await createProduct(db, ownerId, tenantId);
    const idempotencyKey = key();

    const params = { p_variant_id: variantId, p_quantity: 4, p_idempotency_key: idempotencyKey };
    const [first] = await db.as(ownerId).rpc<{ inventory_register_entry: string }>("inventory_register_entry", params);
    const [second] = await db.as(ownerId).rpc<{ inventory_register_entry: string }>("inventory_register_entry", params);

    expect(second!.inventory_register_entry).toBe(first!.inventory_register_entry);
    expect((await stockOf(db, variantId)).physical).toBe(4);

    await expectDbError(
      db.as(ownerId).rpc("inventory_register_entry", { ...params, p_variant_id: other.variantId }),
      "idempotency_conflict",
    );
  });

  it("concurrent duplicate submissions with the same key apply exactly once", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId);
    const idempotencyKey = key();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        db.as(ownerId).rpc("inventory_register_entry", {
          p_variant_id: variantId,
          p_quantity: 1,
          p_idempotency_key: idempotencyKey,
        }),
      ),
    );
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect((await stockOf(db, variantId)).physical).toBe(1);
  });

  it("concurrent losses competing for the last units never oversell", async () => {
    for (let round = 0; round < 3; round++) {
      const { variantId } = await createProduct(db, ownerId, tenantId);
      await entry(ownerId, variantId, 3);

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          db.as(ownerId).rpc("inventory_register_loss", {
            p_variant_id: variantId,
            p_quantity: 1,
            p_reason: "Concorrência",
            p_idempotency_key: key(),
          }),
        ),
      );

      const succeeded = results.filter((result) => result.status === "fulfilled").length;
      const failures = results.filter((result) => result.status === "rejected") as PromiseRejectedResult[];
      expect(succeeded).toBe(3);
      expect(failures.every((failure) => (failure.reason as Error).message === "insufficient_stock")).toBe(true);
      expect(await stockOf(db, variantId)).toEqual({ physical: 0, reserved: 0, available: 0 });

      const [ledger] = await db.admin.query<{ total: string }>(
        "select sum(physical_delta) as total from public.stock_movements where variant_id = $1",
        [variantId],
      );
      expect(Number(ledger!.total)).toBe(0);
    }
  });

  it("stock can only change through movements; ledger is append-only", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId);
    const [row] = await entry(ownerId, variantId, 1);

    await expectDbError(
      db.as(ownerId).query("update public.stock_levels set physical_quantity = 999 where variant_id = $1", [variantId]),
      /permission denied/,
    );
    await expectDbError(
      db.admin.query("update public.stock_movements set quantity = 50 where id = $1", [row!.inventory_register_entry]),
      "append_only",
    );
    await expectDbError(
      db.admin.query("delete from public.stock_movements where id = $1", [row!.inventory_register_entry]),
      "append_only",
    );
  });

  it("enforces permissions and tenant isolation", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId);
    await expectDbError(entry(sellerId, variantId, 1), "forbidden");

    const intruder = await db.createTenantWithOwner("Loja Intrusa");
    await expectDbError(entry(intruder.ownerId, variantId, 1), "forbidden");
    expect(
      await db
        .as(intruder.ownerId)
        .query("select variant_id from public.stock_levels where variant_id = $1", [variantId]),
    ).toHaveLength(0);

    // vendedor vê disponibilidade, mas não o histórico (que contém custos)
    await entry(ownerId, variantId, 2, { p_unit_cost: 10 });
    expect(
      await db.as(sellerId).query("select variant_id from public.stock_levels where variant_id = $1", [variantId]),
    ).toHaveLength(1);
    expect(
      await db.as(sellerId).query("select id from public.stock_movements where variant_id = $1", [variantId]),
    ).toHaveLength(0);
    await expectDbError(entry(managerId, variantId, 1, { p_unit_cost: -1 }), /stock_movements_unit_cost_check/);
  });

  it("rejects invalid quantities", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId);
    await expectDbError(entry(ownerId, variantId, 0), "invalid_quantity");
    await expectDbError(entry(ownerId, variantId, 1.0001), "invalid_quantity");
  });

  it("reports stock status and summary", async () => {
    const shop = await db.createTenantWithOwner("Loja Resumo");
    const low = await createProduct(db, shop.ownerId, shop.tenantId, { name: "Baixo", minStock: 5 });
    const ok = await createProduct(db, shop.ownerId, shop.tenantId, { name: "Ok", minStock: 1 });
    await createProduct(db, shop.ownerId, shop.tenantId, { name: "Zerado" });
    await db.as(shop.ownerId).rpc("inventory_register_entry", {
      p_variant_id: low.variantId,
      p_quantity: 5,
      p_idempotency_key: key(),
    });
    await db.as(shop.ownerId).rpc("inventory_register_entry", {
      p_variant_id: ok.variantId,
      p_quantity: 10,
      p_idempotency_key: key(),
    });

    const rows = await db
      .as(shop.ownerId)
      .query<{ product_name: string; stock_status: string }>(
        "select product_name, stock_status from public.inventory_variant_overview where tenant_id = $1 order by product_name",
        [shop.tenantId],
      );
    expect(rows).toEqual([
      { product_name: "Baixo", stock_status: "LOW" },
      { product_name: "Ok", stock_status: "OK" },
      { product_name: "Zerado", stock_status: "OUT" },
    ]);

    const [summary] = await db
      .as(shop.ownerId)
      .rpc<{ inventory_summary: Record<string, number> }>("inventory_summary", { p_tenant_id: shop.tenantId });
    expect(summary!.inventory_summary).toMatchObject({ active_variants: 3, low_stock: 1, out_of_stock: 1 });
  });
});
