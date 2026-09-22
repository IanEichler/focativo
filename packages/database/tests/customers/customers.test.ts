import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";

describe("customers", () => {
  const db = useTestDatabase();
  let tenantId: string;
  let ownerId: string;
  let sellerId: string;
  let otherTenantId: string;
  let otherOwnerId: string;

  beforeAll(async () => {
    const owner = await db.createTenantWithOwner("Gorila Suplementos");
    tenantId = owner.tenantId;
    ownerId = owner.ownerId;
    sellerId = await db.addActiveMember(tenantId, "VENDEDOR");

    const other = await db.createTenantWithOwner("Outra Loja");
    otherTenantId = other.tenantId;
    otherOwnerId = other.ownerId;
  });

  async function createCustomer(
    userId: string,
    overrides: Partial<{ name: string; phone: string | null; whatsapp: string | null; email: string | null }> = {},
  ) {
    const [row] = await db.as(userId).query<{ id: string }>(
      `insert into public.customers (tenant_id, name, phone, whatsapp, email)
       values ($1, $2, $3, $4, $5) returning id`,
      [
        tenantId,
        overrides.name ?? `Cliente ${randomUUID().slice(0, 6)}`,
        overrides.phone ?? "11988887777",
        overrides.whatsapp ?? null,
        overrides.email ?? null,
      ],
    );
    return row!.id;
  }

  it("requires at least one contact method", async () => {
    await expect(
      db.as(ownerId).query("insert into public.customers (tenant_id, name) values ($1, $2)", [tenantId, "Sem contato"]),
    ).rejects.toThrow();
  });

  it("VENDEDOR can create and read customers of their own tenant", async () => {
    const id = await createCustomer(sellerId, { name: "João Silva" });
    const [row] = await db
      .as(sellerId)
      .query<{ name: string; tenant_id: string }>("select name, tenant_id from public.customers where id = $1", [id]);
    expect(row!.name).toBe("João Silva");
    expect(row!.tenant_id).toBe(tenantId);
  });

  it("RLS isolates customers between tenants", async () => {
    const id = await createCustomer(ownerId, { name: "Cliente Gorila" });
    const visible = await db.as(otherOwnerId).query("select id from public.customers where id = $1", [id]);
    expect(visible).toHaveLength(0);

    await expect(
      db
        .as(otherOwnerId)
        .query("insert into public.customers (tenant_id, name, phone) values ($1, $2, $3)", [
          tenantId,
          "Invasor",
          "11900000000",
        ]),
    ).rejects.toThrow();
  });

  it("enforces unique whatsapp per tenant among active customers", async () => {
    await createCustomer(ownerId, { phone: null, whatsapp: "11955554444" });
    await expect(
      db
        .as(ownerId)
        .query("insert into public.customers (tenant_id, name, whatsapp) values ($1, $2, $3)", [
          tenantId,
          "Duplicado",
          "11955554444",
        ]),
    ).rejects.toThrow();
  });

  it("archiving frees the whatsapp number for reuse", async () => {
    const whatsapp = `1199${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, "0")}`;
    const id = await createCustomer(ownerId, { phone: null, whatsapp });
    await db.as(ownerId).query("update public.customers set archived_at = now() where id = $1", [id]);
    const secondId = await createCustomer(ownerId, { phone: null, whatsapp });
    expect(secondId).not.toBe(id);
  });

  it("creating a customer emits a customer.created timeline event", async () => {
    const id = await createCustomer(ownerId, { name: "Maria Souza" });
    const events = await db
      .as(ownerId)
      .query<{ type: string; payload: { name: string } }>(
        "select type, payload from public.timeline_events where customer_id = $1 order by occurred_at",
        [id],
      );
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("customer.created");
    expect(events[0]!.payload.name).toBe("Maria Souza");
  });

  it("timeline_events cannot be inserted, updated or deleted directly", async () => {
    const id = await createCustomer(ownerId);
    await expect(
      db
        .as(ownerId)
        .query("insert into public.timeline_events (tenant_id, customer_id, type) values ($1, $2, $3)", [
          tenantId,
          id,
          "note.added",
        ]),
    ).rejects.toThrow();

    const [event] = await db.admin.query<{ id: string }>(
      "select id from public.timeline_events where customer_id = $1 limit 1",
      [id],
    );
    await expect(
      db.as(ownerId).query("update public.timeline_events set type = 'x' where id = $1", [event!.id]),
    ).rejects.toThrow();
    await expect(
      db.as(ownerId).query("delete from public.timeline_events where id = $1", [event!.id]),
    ).rejects.toThrow();
  });

  it("customer_stats reports zero/null until sales exist (Fase 4)", async () => {
    const id = await createCustomer(ownerId);
    const [stats] = await db
      .as(ownerId)
      .query<{ total_spent: string; purchase_count: string; average_ticket: string | null }>(
        "select total_spent, purchase_count, average_ticket from public.customer_stats where customer_id = $1",
        [id],
      );
    expect(Number(stats!.total_spent)).toBe(0);
    expect(Number(stats!.purchase_count)).toBe(0);
    expect(stats!.average_ticket).toBeNull();
  });

  it("never allows hard-deleting a customer, even one with no other activity — customer.created is itself an append-only timeline event", async () => {
    const id = await createCustomer(ownerId, { name: "Cliente Vazio", whatsapp: null });
    await expect(db.as(ownerId).query("delete from public.customers where id = $1", [id])).rejects.toThrow(
      "append_only",
    );
    const rows = await db.admin.query("select id from public.customers where id = $1", [id]);
    expect(rows).toHaveLength(1); // segue existindo — só arquivar (archived_at) é reversível de verdade
  });

  it("refuses to delete a customer with WhatsApp message history (append-only)", async () => {
    const whatsappNumber = `1198877${String(Math.floor(1000 + Math.random() * 9000))}`;
    await db.admin.rpc("whatsapp_receive_message", {
      p_tenant_id: tenantId,
      p_whatsapp_number: whatsappNumber,
      p_content: "Oi",
      p_external_message_id: `wa-delete-guard-${randomUUID()}`,
    });
    const [customer] = await db.admin.query<{ id: string }>("select id from public.customers where whatsapp = $1", [
      whatsappNumber,
    ]);

    await expect(db.as(ownerId).query("delete from public.customers where id = $1", [customer!.id])).rejects.toThrow(
      "append_only",
    );

    const stillThere = await db.admin.query("select id from public.customers where id = $1", [customer!.id]);
    expect(stillThere).toHaveLength(1);
  });

  it("VENDEDOR without customers.read sees nothing", async () => {
    const restrictedTenant = await db.createTenantWithOwner("Loja Restrita");
    const restrictedId = await createCustomerFor(restrictedTenant.tenantId, restrictedTenant.ownerId);
    const outsider = await db.addActiveMember(tenantId, "VENDEDOR");
    const rows = await db.as(outsider).query("select id from public.customers where id = $1", [restrictedId]);
    expect(rows).toHaveLength(0);
  });

  async function createCustomerFor(tenant: string, userId: string) {
    const [row] = await db
      .as(userId)
      .query<{ id: string }>("insert into public.customers (tenant_id, name, phone) values ($1, $2, $3) returning id", [
        tenant,
        "Cliente Isolado",
        "11911112222",
      ]);
    return row!.id;
  }
});
