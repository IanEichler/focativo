import { beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";
import { createProduct, key, stockOf } from "../helpers/catalog";

describe("reservations", () => {
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
        "Cliente Reserva",
        "11988887777",
      ]);
    customerId = row!.id;
  });

  async function stockedVariant(quantity: number, name = "Produto Reserva") {
    const { variantId } = await createProduct(db, ownerId, tenantId, { name, salePrice: 100 });
    await db.as(ownerId).rpc("inventory_register_entry", {
      p_variant_id: variantId,
      p_quantity: quantity,
      p_idempotency_key: key(),
    });
    return variantId;
  }

  it("reserving increases reserved_quantity without touching physical_quantity", async () => {
    const variantId = await stockedVariant(10);
    await db.as(sellerId).rpc("reservation_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 3 }]),
    });
    const stock = await stockOf(db, variantId);
    expect(stock.physical).toBe(10);
    expect(stock.reserved).toBe(3);
    expect(stock.available).toBe(7);
  });

  it("locks in the price at reservation time, never trusting client input", async () => {
    const { variantId } = await createProduct(db, ownerId, tenantId, { name: "Preço Travado", salePrice: 250 });
    await db
      .as(ownerId)
      .rpc("inventory_register_entry", { p_variant_id: variantId, p_quantity: 5, p_idempotency_key: key() });

    const [row] = await db.as(sellerId).rpc<{ reservation_create: string }>("reservation_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      // preço enviado pelo cliente (999) deve ser ignorado
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 1, unit_price: 999 }]),
    });
    const [item] = await db
      .as(ownerId)
      .query<{ unit_price: string }>("select unit_price from public.reservation_items where reservation_id = $1", [
        row!.reservation_create,
      ]);
    expect(Number(item!.unit_price)).toBe(250);
  });

  it("rejects reserving more than available", async () => {
    const variantId = await stockedVariant(2, "Estoque Curto");
    await expect(
      db.as(sellerId).rpc("reservation_create", {
        p_tenant_id: tenantId,
        p_customer_id: customerId,
        p_items: JSON.stringify([{ variant_id: variantId, quantity: 5 }]),
      }),
    ).rejects.toThrow("insufficient_stock");
  });

  it("is idempotent: repeating the same key returns the same reservation without double-reserving", async () => {
    const variantId = await stockedVariant(10, "Idempotente Reserva");
    const idempotencyKey = key();
    const [first] = await db.as(sellerId).rpc<{ reservation_create: string }>("reservation_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 4 }]),
      p_idempotency_key: idempotencyKey,
    });
    const [second] = await db.as(sellerId).rpc<{ reservation_create: string }>("reservation_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 4 }]),
      p_idempotency_key: idempotencyKey,
    });
    expect(second!.reservation_create).toBe(first!.reservation_create);
    const stock = await stockOf(db, variantId);
    expect(stock.reserved).toBe(4);
  });

  it("advances PENDING -> CONFIRMED -> AWAITING_PICKUP but rejects skipping a step", async () => {
    const variantId = await stockedVariant(10, "Fluxo Reserva");
    const [row] = await db.as(sellerId).rpc<{ reservation_create: string }>("reservation_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
    });
    const reservationId = row!.reservation_create;

    await expect(
      db.as(sellerId).rpc("reservation_advance", { p_reservation_id: reservationId, p_status: "AWAITING_PICKUP" }),
    ).rejects.toThrow("invalid_input");

    await db.as(sellerId).rpc("reservation_advance", { p_reservation_id: reservationId, p_status: "CONFIRMED" });
    await db.as(sellerId).rpc("reservation_advance", { p_reservation_id: reservationId, p_status: "AWAITING_PICKUP" });

    const [reservation] = await db
      .as(ownerId)
      .query<{ status: string }>("select status from public.reservations where id = $1", [reservationId]);
    expect(reservation!.status).toBe("AWAITING_PICKUP");
  });

  it("canceling releases the reserved stock and records the reason", async () => {
    const variantId = await stockedVariant(10, "Cancelar Reserva");
    const [row] = await db.as(sellerId).rpc<{ reservation_create: string }>("reservation_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 6 }]),
    });
    const reservationId = row!.reservation_create;

    await db.as(sellerId).rpc("reservation_cancel", { p_reservation_id: reservationId, p_reason: "Cliente desistiu" });

    const stock = await stockOf(db, variantId);
    expect(stock.reserved).toBe(0);
    expect(stock.physical).toBe(10);

    const [reservation] = await db
      .as(ownerId)
      .query<{ status: string; canceled_reason: string }>(
        "select status, canceled_reason from public.reservations where id = $1",
        [reservationId],
      );
    expect(reservation!.status).toBe("CANCELED");
    expect(reservation!.canceled_reason).toBe("Cliente desistiu");
  });

  it("cannot cancel a reservation that is already completed/canceled/expired", async () => {
    const variantId = await stockedVariant(10, "Duplo Cancelamento");
    const [row] = await db.as(sellerId).rpc<{ reservation_create: string }>("reservation_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
    });
    const reservationId = row!.reservation_create;
    await db.as(sellerId).rpc("reservation_cancel", { p_reservation_id: reservationId });

    await expect(db.as(sellerId).rpc("reservation_cancel", { p_reservation_id: reservationId })).rejects.toThrow(
      "invalid_input",
    );
  });

  it("completing converts the reservation into a sale, consuming reserved stock exactly once", async () => {
    const variantId = await stockedVariant(10, "Completar Reserva");
    const [row] = await db.as(sellerId).rpc<{ reservation_create: string }>("reservation_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 4 }]),
    });
    const reservationId = row!.reservation_create;

    const [sale] = await db.as(sellerId).rpc<{ reservation_complete: string }>("reservation_complete", {
      p_reservation_id: reservationId,
      p_payment_method: "pix",
      p_paid_amount: 400,
    });
    const saleId = sale!.reservation_complete;

    const stock = await stockOf(db, variantId);
    expect(stock.physical).toBe(6);
    expect(stock.reserved).toBe(0);
    expect(stock.available).toBe(6);

    const [saleRow] = await db
      .as(ownerId)
      .query<{ total: string; reservation_id: string }>(
        "select total, reservation_id from public.sales where id = $1",
        [saleId],
      );
    expect(Number(saleRow!.total)).toBe(400);
    expect(saleRow!.reservation_id).toBe(reservationId);

    const [reservation] = await db
      .as(ownerId)
      .query<{ status: string; completed_sale_id: string }>(
        "select status, completed_sale_id from public.reservations where id = $1",
        [reservationId],
      );
    expect(reservation!.status).toBe("COMPLETED");
    expect(reservation!.completed_sale_id).toBe(saleId);
  });

  it("expires due reservations and releases their stock", async () => {
    const variantId = await stockedVariant(10, "Expira Reserva");
    const [row] = await db.as(sellerId).rpc<{ reservation_create: string }>("reservation_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 5 }]),
      p_expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const reservationId = row!.reservation_create;

    const [result] = await db
      .as(sellerId)
      .rpc<{ reservations_expire_due: number }>("reservations_expire_due", { p_tenant_id: tenantId });
    expect(result!.reservations_expire_due).toBeGreaterThanOrEqual(1);

    const stock = await stockOf(db, variantId);
    expect(stock.reserved).toBe(0);

    const [reservation] = await db
      .as(ownerId)
      .query<{ status: string }>("select status from public.reservations where id = $1", [reservationId]);
    expect(reservation!.status).toBe("EXPIRED");
  });

  it("emits timeline events for creation, status change, cancellation and completion", async () => {
    const variantId = await stockedVariant(10, "Timeline Reserva");
    const [row] = await db.as(sellerId).rpc<{ reservation_create: string }>("reservation_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 2 }]),
    });
    const reservationId = row!.reservation_create;
    await db.as(sellerId).rpc("reservation_advance", { p_reservation_id: reservationId, p_status: "CONFIRMED" });
    await db.as(sellerId).rpc("reservation_complete", { p_reservation_id: reservationId });

    const events = await db
      .as(ownerId)
      .query<{ type: string }>(
        "select type from public.timeline_events where customer_id = $1 and payload->>'reservation_id' = $2 order by occurred_at",
        [customerId, reservationId],
      );
    expect(events.map((e) => e.type)).toEqual(["reservation.created", "reservation.status_changed", "sale.completed"]);
  });
});
