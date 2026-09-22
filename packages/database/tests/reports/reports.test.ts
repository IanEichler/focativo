import { beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";
import { createProduct, key } from "../helpers/catalog";

describe("relatórios / inteligência comercial", () => {
  const db = useTestDatabase();
  let tenantId: string;
  let ownerId: string;
  let sellerId: string;
  let customerId: string;
  let variantId: string;

  beforeAll(async () => {
    const owner = await db.createTenantWithOwner("Gorila Suplementos");
    tenantId = owner.tenantId;
    ownerId = owner.ownerId;
    sellerId = await db.addActiveMember(tenantId, "VENDEDOR");

    const [customer] = await db
      .as(ownerId)
      .query<{ id: string }>("insert into public.customers (tenant_id, name, phone) values ($1, $2, $3) returning id", [
        tenantId,
        "Cliente Relatório",
        "11955554444",
      ]);
    customerId = customer!.id;

    const product = await createProduct(db, ownerId, tenantId, { name: "Whey Relatório", salePrice: 100 });
    variantId = product.variantId;
    await db
      .as(ownerId)
      .rpc("inventory_register_entry", { p_variant_id: variantId, p_quantity: 50, p_idempotency_key: key() });

    // Uma venda confirmada (conta para os relatórios) e uma cancelada (não deve contar).
    await db.as(sellerId).rpc("sale_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 4 }]),
      p_payment_method: "pix",
      p_paid_amount: 400,
    });

    const [canceled] = await db.as(sellerId).rpc<{ sale_create: string }>("sale_create", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_items: JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
      p_payment_method: "pix",
      p_paid_amount: 100,
    });
    await db.as(sellerId).rpc("sale_cancel", { p_sale_id: canceled!.sale_create });
  });

  it("financial.read is required for every report", async () => {
    await expect(
      db.as(sellerId).rpc("report_sales_by_day", { p_tenant_id: tenantId, p_since: null, p_until: null }),
    ).rejects.toThrow(/forbidden/);
  });

  it("aggregates sales by day, ignoring canceled sales", async () => {
    const rows = await db.as(ownerId).rpc<{ sales_count: number; revenue: string }>("report_sales_by_day", {
      p_tenant_id: tenantId,
      p_since: null,
      p_until: null,
    });
    const today = rows.at(-1)!;
    expect(Number(today.sales_count)).toBe(1);
    expect(Number(today.revenue)).toBe(400);
  });

  it("ranks top products by revenue, ignoring canceled sales", async () => {
    const rows = await db
      .as(ownerId)
      .rpc<{ variant_id: string; quantity_sold: string; revenue: string }>("report_top_products", {
        p_tenant_id: tenantId,
        p_since: null,
        p_limit: 5,
      });
    expect(rows[0]!.variant_id).toBe(variantId);
    expect(Number(rows[0]!.quantity_sold)).toBe(4);
    expect(Number(rows[0]!.revenue)).toBe(400);
  });

  it("ranks top customers by total spent, ignoring canceled sales", async () => {
    const rows = await db
      .as(ownerId)
      .rpc<{ customer_id: string; purchase_count: string; total_spent: string }>("report_top_customers", {
        p_tenant_id: tenantId,
        p_since: null,
        p_limit: 5,
      });
    expect(rows[0]!.customer_id).toBe(customerId);
    expect(Number(rows[0]!.purchase_count)).toBe(1);
    expect(Number(rows[0]!.total_spent)).toBe(400);
  });

  it("summarizes the CRM funnel per stage", async () => {
    const [stage] = await db.admin.query<{ id: string }>(
      "select id from public.crm_stages where tenant_id = $1 and not is_won and not is_lost order by sort_order limit 1",
      [tenantId],
    );
    await db.as(ownerId).rpc("crm_create_opportunity", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_stage_id: stage!.id,
    });

    const rows = await db.as(ownerId).rpc<{ stage_id: string; opportunity_count: string }>("report_crm_funnel", {
      p_tenant_id: tenantId,
      p_since: null,
    });
    const row = rows.find((r) => r.stage_id === stage!.id);
    expect(Number(row!.opportunity_count)).toBe(1);
  });
});

describe("jobs: varredura global de reservas vencidas", () => {
  const db = useTestDatabase();

  it("reservations_expire_due_sweep only runs for service_role (no authenticated caller)", async () => {
    const { tenantId, ownerId } = await db.createTenantWithOwner("Tenant Job");
    await expect(db.as(ownerId).rpc("reservations_expire_due_sweep", {})).rejects.toThrow(/forbidden/);
    void tenantId;
  });

  it("expires due reservations across every tenant in a single call", async () => {
    const tenantA = await db.createTenantWithOwner("Tenant A");
    const tenantB = await db.createTenantWithOwner("Tenant B");
    const sellerA = await db.addActiveMember(tenantA.tenantId, "VENDEDOR");
    const sellerB = await db.addActiveMember(tenantB.tenantId, "VENDEDOR");

    const [customerA] = await db
      .as(tenantA.ownerId)
      .query<{ id: string }>("insert into public.customers (tenant_id, name, phone) values ($1, $2, $3) returning id", [
        tenantA.tenantId,
        "Cliente A",
        "11911112222",
      ]);
    const [customerB] = await db
      .as(tenantB.ownerId)
      .query<{ id: string }>("insert into public.customers (tenant_id, name, phone) values ($1, $2, $3) returning id", [
        tenantB.tenantId,
        "Cliente B",
        "11933334444",
      ]);

    const productA = await createProduct(db, tenantA.ownerId, tenantA.tenantId, { name: "Produto A" });
    const productB = await createProduct(db, tenantB.ownerId, tenantB.tenantId, { name: "Produto B" });
    await db.as(tenantA.ownerId).rpc("inventory_register_entry", {
      p_variant_id: productA.variantId,
      p_quantity: 10,
      p_idempotency_key: key(),
    });
    await db.as(tenantB.ownerId).rpc("inventory_register_entry", {
      p_variant_id: productB.variantId,
      p_quantity: 10,
      p_idempotency_key: key(),
    });

    const [reservationA] = await db.as(sellerA).rpc<{ reservation_create: string }>("reservation_create", {
      p_tenant_id: tenantA.tenantId,
      p_customer_id: customerA!.id,
      p_items: JSON.stringify([{ variant_id: productA.variantId, quantity: 2 }]),
      p_expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const [reservationB] = await db.as(sellerB).rpc<{ reservation_create: string }>("reservation_create", {
      p_tenant_id: tenantB.tenantId,
      p_customer_id: customerB!.id,
      p_items: JSON.stringify([{ variant_id: productB.variantId, quantity: 2 }]),
      p_expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const [result] = await db.admin.rpc<{ reservations_expire_due_sweep: number }>("reservations_expire_due_sweep", {});
    expect(result!.reservations_expire_due_sweep).toBeGreaterThanOrEqual(2);

    const [rowA] = await db.admin.query<{ status: string }>("select status from public.reservations where id = $1", [
      reservationA!.reservation_create,
    ]);
    const [rowB] = await db.admin.query<{ status: string }>("select status from public.reservations where id = $1", [
      reservationB!.reservation_create,
    ]);
    expect(rowA!.status).toBe("EXPIRED");
    expect(rowB!.status).toBe("EXPIRED");
  });
});
