import { beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";
import { createProduct, key, stockOf } from "../helpers/catalog";

/**
 * Seção 28 do escopo, cenário literal: estoque disponível = 1, dois clientes
 * tentam reservar ao mesmo tempo — só um pode vencer. Cobre reserva-vs-reserva,
 * reserva-vs-venda e vendas concorrentes, todas serializadas pelo `for update`
 * em stock_levels dentro de private.apply_stock_movement (Fase 2).
 */
describe("concorrência entre reservas e vendas", () => {
  const db = useTestDatabase();
  let tenantId: string;
  let ownerId: string;
  let customerId: string;

  beforeAll(async () => {
    const owner = await db.createTenantWithOwner("Gorila Suplementos");
    tenantId = owner.tenantId;
    ownerId = owner.ownerId;
    const [row] = await db
      .as(ownerId)
      .query<{ id: string }>("insert into public.customers (tenant_id, name, phone) values ($1, $2, $3) returning id", [
        tenantId,
        "Cliente Concorrência",
        "11966665555",
      ]);
    customerId = row!.id;
  });

  async function stockedVariant(quantity: number, name: string) {
    const { variantId } = await createProduct(db, ownerId, tenantId, { name, salePrice: 50 });
    await db
      .as(ownerId)
      .rpc("inventory_register_entry", { p_variant_id: variantId, p_quantity: quantity, p_idempotency_key: key() });
    return variantId;
  }

  it("estoque disponível = 1: duas reservas simultâneas — só uma vence", async () => {
    const variantId = await stockedVariant(1, "Disputa Reserva");

    const results = await Promise.allSettled([
      db.as(ownerId).rpc("reservation_create", {
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
      }),
      db.as(ownerId).rpc("reservation_create", {
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
      }),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.reason.message).toBe("insufficient_stock");

    const stock = await stockOf(db, variantId);
    expect(stock.reserved).toBe(1);
    expect(stock.available).toBe(0);
  });

  it("estoque disponível = 1: reserva e venda disputando o mesmo saldo — só uma vence", async () => {
    const variantId = await stockedVariant(1, "Disputa Reserva Venda");

    const results = await Promise.allSettled([
      db.as(ownerId).rpc("reservation_create", {
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
      }),
      db.as(ownerId).rpc("sale_create", {
        p_tenant_id: tenantId,
        p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
      }),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    expect(succeeded).toHaveLength(1);

    // Disponível sempre esgota; a vencedora tanto pode ter sido a reserva
    // (reserved=1, physical intocado) quanto a venda (physical=0, reserved=0).
    const stock = await stockOf(db, variantId);
    expect(stock.available).toBe(0);
    expect(stock.physical).toBe(stock.reserved === 1 ? 1 : 0);
  });

  it("dez vendas disputando cinco unidades: exatamente cinco vencem, nunca vende mais do que existe", async () => {
    const variantId = await stockedVariant(5, "Disputa Venda Múltipla");

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        db.as(ownerId).rpc("sale_create", {
          p_tenant_id: tenantId,
          p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
        }),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(succeeded).toBe(5);
    expect(failed.every((f) => f.reason.message === "insufficient_stock")).toBe(true);

    const stock = await stockOf(db, variantId);
    expect(stock).toEqual({ physical: 0, reserved: 0, available: 0 });

    const sales = await db.admin.query(
      `select s.id from public.sales s join public.sale_items si on si.sale_id = s.id
       where si.variant_id = $1`,
      [variantId],
    );
    expect(sales).toHaveLength(5);
  });

  it("completar uma reserva e cancelar a mesma reserva ao mesmo tempo: só uma transição vence", async () => {
    const variantId = await stockedVariant(3, "Disputa Completar Cancelar");
    const [row] = await db.as(ownerId).rpc<{ reservation_create: string }>("reservation_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 2 }]),
    });
    const reservationId = row!.reservation_create;

    const results = await Promise.allSettled([
      db.as(ownerId).rpc("reservation_complete", { p_reservation_id: reservationId }),
      db.as(ownerId).rpc("reservation_cancel", { p_reservation_id: reservationId, p_reason: "corrida" }),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    expect(succeeded).toHaveLength(1);

    const [reservation] = await db
      .as(ownerId)
      .query<{ status: string }>("select status from public.reservations where id = $1", [reservationId]);
    expect(["COMPLETED", "CANCELED"]).toContain(reservation!.status);

    // De um jeito ou de outro, o estoque reservado nunca fica "preso": ou virou
    // venda (physical cai, reserved zera) ou foi liberado (reserved zera, physical intocado).
    const stock = await stockOf(db, variantId);
    expect(stock.reserved).toBe(0);
  });
});
