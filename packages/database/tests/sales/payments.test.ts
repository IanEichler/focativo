import { beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";
import { createProduct, key, stockOf } from "../helpers/catalog";

describe("payments (PaymentProvider + webhooks idempotentes)", () => {
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
        "Cliente Pagamento",
        "11933334444",
      ]);
    customerId = row!.id;
  });

  /** Cada teste ganha sua própria variante com estoque isolado (evita disputa entre casos). */
  async function stockedVariant(quantity: number, name: string, salePrice = 80) {
    const { variantId } = await createProduct(db, ownerId, tenantId, { name, salePrice });
    await db
      .as(ownerId)
      .rpc("inventory_register_entry", { p_variant_id: variantId, p_quantity: quantity, p_idempotency_key: key() });
    return variantId;
  }

  async function createReservation(variantId: string, quantity = 2) {
    const [row] = await db.as(sellerId).rpc<{ reservation_create: string }>("reservation_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity }]),
    });
    return row!.reservation_create;
  }

  it("creates a PENDING charge for a reservation with the amount computed server-side", async () => {
    const variantId = await stockedVariant(10, "Pagamento Charge");
    const reservationId = await createReservation(variantId, 2);
    const [row] = await db.as(sellerId).rpc<{ payment_create_charge: string }>("payment_create_charge", {
      p_tenant_id: tenantId,
      p_reservation_id: reservationId,
      p_method: "pix",
    });
    const paymentId = row!.payment_create_charge;

    const [payment] = await db
      .as(ownerId)
      .query<{ amount: string; status: string; method: string }>(
        "select amount, status, method from public.payments where id = $1",
        [paymentId],
      );
    expect(Number(payment!.amount)).toBe(160); // 2 x 80
    expect(payment!.status).toBe("PENDING");
    expect(payment!.method).toBe("pix");
  });

  it("attaches provider info (charge id + instructions) after creation, and rejects once no longer PENDING", async () => {
    const variantId = await stockedVariant(10, "Pagamento Anexar Provider");
    const reservationId = await createReservation(variantId, 1);
    const [row] = await db.as(sellerId).rpc<{ payment_create_charge: string }>("payment_create_charge", {
      p_tenant_id: tenantId,
      p_reservation_id: reservationId,
      p_method: "pix",
    });
    const paymentId = row!.payment_create_charge;

    await db.as(sellerId).rpc("payment_attach_provider_info", {
      p_payment_id: paymentId,
      p_provider_charge_id: `dev_${paymentId}`,
      p_metadata: JSON.stringify({ instructions: { pixCode: "00020126FAKE" } }),
    });
    const [payment] = await db
      .as(ownerId)
      .query<{ provider_charge_id: string; metadata: { instructions: { pixCode: string } } }>(
        "select provider_charge_id, metadata from public.payments where id = $1",
        [paymentId],
      );
    expect(payment!.provider_charge_id).toBe(`dev_${paymentId}`);
    expect(payment!.metadata.instructions.pixCode).toBe("00020126FAKE");

    await db.admin.rpc("payment_confirm", { p_payment_id: paymentId });
    await expect(
      db.as(sellerId).rpc("payment_attach_provider_info", {
        p_payment_id: paymentId,
        p_provider_charge_id: "outro",
      }),
    ).rejects.toThrow("invalid_input");
  });

  it("rejects a charge for a reservation that is already completed/canceled", async () => {
    const variantId = await stockedVariant(10, "Pagamento Rejeitado");
    const reservationId = await createReservation(variantId, 1);
    await db.as(sellerId).rpc("reservation_cancel", { p_reservation_id: reservationId });
    await expect(
      db
        .as(sellerId)
        .rpc("payment_create_charge", { p_tenant_id: tenantId, p_reservation_id: reservationId, p_method: "pix" }),
    ).rejects.toThrow("invalid_input");
  });

  it("confirming a charge (authenticated path) converts the reservation into a sale exactly once", async () => {
    const variantId = await stockedVariant(10, "Pagamento Confirma Autenticado");
    const reservationId = await createReservation(variantId, 3);
    const [row] = await db.as(sellerId).rpc<{ payment_create_charge: string }>("payment_create_charge", {
      p_tenant_id: tenantId,
      p_reservation_id: reservationId,
      p_method: "pix",
    });
    const paymentId = row!.payment_create_charge;

    const [confirm] = await db
      .as(sellerId)
      .rpc<{ payment_confirm: string }>("payment_confirm", { p_payment_id: paymentId });
    const saleId = confirm!.payment_confirm;
    expect(saleId).toBeTruthy();

    const [sale] = await db
      .as(ownerId)
      .query<{ total: string }>("select total from public.sales where id = $1", [saleId]);
    expect(Number(sale!.total)).toBe(240); // 3 x 80

    const [reservation] = await db
      .as(ownerId)
      .query<{ status: string; completed_sale_id: string }>(
        "select status, completed_sale_id from public.reservations where id = $1",
        [reservationId],
      );
    expect(reservation!.status).toBe("COMPLETED");
    expect(reservation!.completed_sale_id).toBe(saleId);
  });

  it("confirming via the webhook path (no authenticated user) works and stamps SYSTEM as the actor", async () => {
    const variantId = await stockedVariant(10, "Pagamento Webhook Path");
    const reservationId = await createReservation(variantId, 1);
    const [row] = await db.as(sellerId).rpc<{ payment_create_charge: string }>("payment_create_charge", {
      p_tenant_id: tenantId,
      p_reservation_id: reservationId,
      p_method: "pix",
    });
    const paymentId = row!.payment_create_charge;

    // db.admin roda como "postgres" sem request.jwt.claims: auth.uid() é nulo,
    // exatamente a mesma condição da rota de webhook chamando via service role.
    const [confirm] = await db.admin.rpc<{ payment_confirm: string }>("payment_confirm", {
      p_payment_id: paymentId,
      p_provider_charge_id: "dev_charge_123",
    });
    expect(confirm!.payment_confirm).toBeTruthy();

    const [payment] = await db.admin.query<{ provider_charge_id: string }>(
      "select provider_charge_id from public.payments where id = $1",
      [paymentId],
    );
    expect(payment!.provider_charge_id).toBe("dev_charge_123");

    const [movement] = await db.admin.query<{ actor_type: string }>(
      "select actor_type from public.stock_movements where reference_type = 'sale' and variant_id = $1 order by created_at desc limit 1",
      [variantId],
    );
    expect(movement!.actor_type).toBe("SYSTEM");
  });

  it("webhook repeated confirmation is idempotent: never duplicates the sale or the stock movement", async () => {
    const variantId = await stockedVariant(10, "Pagamento Idempotente");
    const reservationId = await createReservation(variantId, 2);
    const [row] = await db.as(sellerId).rpc<{ payment_create_charge: string }>("payment_create_charge", {
      p_tenant_id: tenantId,
      p_reservation_id: reservationId,
      p_method: "pix",
    });
    const paymentId = row!.payment_create_charge;

    const [first] = await db.admin.rpc<{ payment_confirm: string }>("payment_confirm", { p_payment_id: paymentId });
    const [second] = await db.admin.rpc<{ payment_confirm: string }>("payment_confirm", { p_payment_id: paymentId });
    const [third] = await db.admin.rpc<{ payment_confirm: string }>("payment_confirm", { p_payment_id: paymentId });

    expect(second!.payment_confirm).toBe(first!.payment_confirm);
    expect(third!.payment_confirm).toBe(first!.payment_confirm);

    const sales = await db.admin.query("select id from public.sales where reservation_id = $1", [reservationId]);
    expect(sales).toHaveLength(1);

    const movements = await db.admin.query(
      "select id from public.stock_movements where reference_type = 'sale' and reference_id = $1",
      [first!.payment_confirm],
    );
    expect(movements).toHaveLength(1);

    const stock = await stockOf(db, variantId);
    expect(stock.reserved).toBe(0); // não ficou preso: consumida exatamente uma vez
  });

  it("cannot confirm an already-failed charge, and cannot fail an already-confirmed one", async () => {
    const variantA = await stockedVariant(10, "Pagamento Falha A");
    const reservationA = await createReservation(variantA, 1);
    const [chargeA] = await db.as(sellerId).rpc<{ payment_create_charge: string }>("payment_create_charge", {
      p_tenant_id: tenantId,
      p_reservation_id: reservationA,
      p_method: "pix",
    });
    await db.admin.rpc("payment_fail", { p_payment_id: chargeA!.payment_create_charge, p_reason: "PIX expirou" });
    await expect(db.admin.rpc("payment_confirm", { p_payment_id: chargeA!.payment_create_charge })).rejects.toThrow(
      "invalid_input",
    );

    const variantB = await stockedVariant(10, "Pagamento Falha B");
    const reservationB = await createReservation(variantB, 1);
    const [chargeB] = await db.as(sellerId).rpc<{ payment_create_charge: string }>("payment_create_charge", {
      p_tenant_id: tenantId,
      p_reservation_id: reservationB,
      p_method: "pix",
    });
    await db.admin.rpc("payment_confirm", { p_payment_id: chargeB!.payment_create_charge });
    await expect(
      db.admin.rpc("payment_fail", { p_payment_id: chargeB!.payment_create_charge, p_reason: "tarde demais" }),
    ).rejects.toThrow("invalid_input");
  });

  it("repeated webhook failure is idempotent (no-op, not an error)", async () => {
    const variantId = await stockedVariant(10, "Pagamento Falha Repetida");
    const reservationId = await createReservation(variantId, 1);
    const [charge] = await db.as(sellerId).rpc<{ payment_create_charge: string }>("payment_create_charge", {
      p_tenant_id: tenantId,
      p_reservation_id: reservationId,
      p_method: "pix",
    });
    await db.admin.rpc("payment_fail", { p_payment_id: charge!.payment_create_charge, p_reason: "saldo insuficiente" });
    await db.admin.rpc("payment_fail", { p_payment_id: charge!.payment_create_charge, p_reason: "saldo insuficiente" });
    const [payment] = await db.admin.query<{ status: string }>("select status from public.payments where id = $1", [
      charge!.payment_create_charge,
    ]);
    expect(payment!.status).toBe("FAILED");
  });

  it("merchant can cancel a still-pending charge but not a confirmed one", async () => {
    const variantId = await stockedVariant(10, "Pagamento Cancelar A");
    const reservationId = await createReservation(variantId, 1);
    const [charge] = await db.as(sellerId).rpc<{ payment_create_charge: string }>("payment_create_charge", {
      p_tenant_id: tenantId,
      p_reservation_id: reservationId,
      p_method: "pix",
    });
    await db.as(sellerId).rpc("payment_cancel", { p_payment_id: charge!.payment_create_charge });
    const [payment] = await db.admin.query<{ status: string }>("select status from public.payments where id = $1", [
      charge!.payment_create_charge,
    ]);
    expect(payment!.status).toBe("CANCELED");

    const variantB = await stockedVariant(10, "Pagamento Cancelar B");
    const reservationB = await createReservation(variantB, 1);
    const [chargeB] = await db.as(sellerId).rpc<{ payment_create_charge: string }>("payment_create_charge", {
      p_tenant_id: tenantId,
      p_reservation_id: reservationB,
      p_method: "pix",
    });
    await db.admin.rpc("payment_confirm", { p_payment_id: chargeB!.payment_create_charge });
    await expect(
      db.as(sellerId).rpc("payment_cancel", { p_payment_id: chargeB!.payment_create_charge }),
    ).rejects.toThrow("invalid_input");
  });

  it("two concurrent webhook confirmations for the same charge only create one sale", async () => {
    const variantId = await stockedVariant(10, "Pagamento Concorrência");
    const reservationId = await createReservation(variantId, 1);
    const [charge] = await db.as(sellerId).rpc<{ payment_create_charge: string }>("payment_create_charge", {
      p_tenant_id: tenantId,
      p_reservation_id: reservationId,
      p_method: "pix",
    });
    const paymentId = charge!.payment_create_charge;

    const results = await Promise.allSettled([
      db.admin.rpc("payment_confirm", { p_payment_id: paymentId }),
      db.admin.rpc("payment_confirm", { p_payment_id: paymentId }),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const sales = await db.admin.query("select id from public.sales where reservation_id = $1", [reservationId]);
    expect(sales).toHaveLength(1);
  });

  it("emits a payment.created timeline event when a charge is created", async () => {
    const variantId = await stockedVariant(10, "Pagamento Timeline");
    const reservationId = await createReservation(variantId, 1);
    await db
      .as(sellerId)
      .rpc("payment_create_charge", { p_tenant_id: tenantId, p_reservation_id: reservationId, p_method: "pix" });
    const events = await db
      .as(ownerId)
      .query<{ type: string }>(
        "select type from public.timeline_events where customer_id = $1 and type = 'payment.created'",
        [customerId],
      );
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});

describe("financial summary", () => {
  const db = useTestDatabase();
  let tenantId: string;
  let ownerId: string;
  let sellerId: string;
  let customerId: string;
  let variantId: string;

  beforeAll(async () => {
    const owner = await db.createTenantWithOwner("Financeiro Ltda");
    tenantId = owner.tenantId;
    ownerId = owner.ownerId;
    sellerId = await db.addActiveMember(tenantId, "VENDEDOR");

    const [row] = await db
      .as(ownerId)
      .query<{ id: string }>("insert into public.customers (tenant_id, name, phone) values ($1, $2, $3) returning id", [
        tenantId,
        "Cliente Financeiro",
        "11922223333",
      ]);
    customerId = row!.id;

    const product = await createProduct(db, ownerId, tenantId, { name: "Produto Financeiro", salePrice: 100 });
    variantId = product.variantId;
    await db
      .as(ownerId)
      .rpc("inventory_register_entry", { p_variant_id: variantId, p_quantity: 20, p_idempotency_key: key() });
  });

  it("VENDEDOR cannot read the financial summary even though they can read sales", async () => {
    await expect(db.as(sellerId).rpc("financial_summary", { p_tenant_id: tenantId })).rejects.toThrow("forbidden");
    await expect(db.as(sellerId).rpc("sales_receivables", { p_tenant_id: tenantId })).rejects.toThrow("forbidden");
  });

  it("aggregates revenue, received and pending across sales, ignoring canceled ones", async () => {
    await db.as(ownerId).rpc("sale_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
      p_payment_method: "pix",
      p_paid_amount: 100,
    });
    const [row] = await db.as(ownerId).rpc<{ sale_create: string }>("sale_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 2 }]),
      p_payment_method: "credit_card",
      // sem paid_amount: fica pendente (conta a receber)
    });
    const canceled = await db.as(ownerId).rpc<{ sale_create: string }>("sale_create", {
      p_tenant_id: tenantId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
      p_payment_method: "cash",
      p_paid_amount: 100,
    });
    await db.as(ownerId).rpc("sale_cancel", { p_sale_id: canceled[0]!.sale_create });

    const [summary] = await db.as(ownerId).rpc<{
      revenue: string;
      received: string;
      pending: string;
      sales_count: string;
      by_method: Record<string, string>;
    }>("financial_summary", { p_tenant_id: tenantId });

    expect(Number(summary!.revenue)).toBe(300); // 100 + 200, venda cancelada não conta
    expect(Number(summary!.received)).toBe(100); // só a primeira foi paga
    expect(Number(summary!.pending)).toBe(200);
    expect(Number(summary!.sales_count)).toBe(2);

    const receivables = await db.as(ownerId).rpc<{ sale_id: string; balance: string }>("sales_receivables", {
      p_tenant_id: tenantId,
    });
    expect(receivables).toHaveLength(1);
    expect(Number(receivables[0]!.balance)).toBe(200);
    expect(receivables[0]!.sale_id).toBe(row!.sale_create);
  });
});
