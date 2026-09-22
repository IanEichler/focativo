import { beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";
import { createProduct } from "../helpers/catalog";

describe("CRM", () => {
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
        "Cliente CRM",
        "11988887777",
      ]);
    customerId = row!.id;
  });

  it("seeds the seven default stages for a new tenant, ordered and flagged", async () => {
    const stages = await db
      .as(ownerId)
      .query<{ code: string; is_won: boolean; is_lost: boolean }>(
        "select code, is_won, is_lost from public.crm_stages where tenant_id = $1 order by sort_order",
        [tenantId],
      );
    expect(stages.map((s) => s.code)).toEqual([
      "novo",
      "em_atendimento",
      "interessado",
      "reservado",
      "aguardando_pagamento",
      "vendido",
      "perdido",
    ]);
    expect(stages.find((s) => s.code === "vendido")!.is_won).toBe(true);
    expect(stages.find((s) => s.code === "perdido")!.is_lost).toBe(true);
  });

  async function firstStage(code: string) {
    const [row] = await db.admin.query<{ id: string }>(
      "select id from public.crm_stages where tenant_id = $1 and code = $2",
      [tenantId, code],
    );
    return row!.id;
  }

  it("creates an opportunity defaulting to the first open stage and logs timeline + audit", async () => {
    const [row] = await db.as(sellerId).rpc<{ crm_create_opportunity: string }>("crm_create_opportunity", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_title: "Whey chocolate 900g",
      p_estimated_value: 189.9,
    });
    const opportunityId = row!.crm_create_opportunity;

    const [opp] = await db
      .as(ownerId)
      .query<{ stage_id: string; title: string }>(
        "select stage_id, title from public.crm_opportunities where id = $1",
        [opportunityId],
      );
    expect(opp!.stage_id).toBe(await firstStage("novo"));
    expect(opp!.title).toBe("Whey chocolate 900g");

    const events = await db
      .as(ownerId)
      .query<{ type: string }>(
        "select type from public.timeline_events where customer_id = $1 and type = 'crm.opportunity_created'",
        [customerId],
      );
    expect(events).toHaveLength(1);

    const audit = await db.admin.query(
      "select id from public.audit_logs where action = 'crm_opportunity.created' and entity_id = $1",
      [opportunityId],
    );
    expect(audit).toHaveLength(1);
  });

  it("moving to a won stage sets won_at and emits crm.opportunity_won", async () => {
    const [row] = await db.as(ownerId).rpc<{ crm_create_opportunity: string }>("crm_create_opportunity", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_title: "Creatina",
    });
    const opportunityId = row!.crm_create_opportunity;

    await db.as(ownerId).rpc("crm_move_opportunity", {
      p_opportunity_id: opportunityId,
      p_stage_id: await firstStage("vendido"),
    });

    const [opp] = await db
      .as(ownerId)
      .query<{ won_at: string | null; lost_at: string | null }>(
        "select won_at, lost_at from public.crm_opportunities where id = $1",
        [opportunityId],
      );
    expect(opp!.won_at).not.toBeNull();
    expect(opp!.lost_at).toBeNull();

    const events = await db
      .as(ownerId)
      .query<{ type: string }>(
        "select type from public.timeline_events where payload->>'opportunity_id' = $1 order by occurred_at",
        [opportunityId],
      );
    expect(events.map((e) => e.type)).toEqual(["crm.opportunity_created", "crm.opportunity_won"]);
  });

  it("moving to a lost stage records the reason and clears won_at if it changes again", async () => {
    const [row] = await db.as(ownerId).rpc<{ crm_create_opportunity: string }>("crm_create_opportunity", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
    });
    const opportunityId = row!.crm_create_opportunity;

    await db.as(ownerId).rpc("crm_move_opportunity", {
      p_opportunity_id: opportunityId,
      p_stage_id: await firstStage("perdido"),
      p_lost_reason: "Comprou em outra loja",
    });

    const [opp] = await db
      .as(ownerId)
      .query<{ lost_at: string | null; lost_reason: string | null }>(
        "select lost_at, lost_reason from public.crm_opportunities where id = $1",
        [opportunityId],
      );
    expect(opp!.lost_at).not.toBeNull();
    expect(opp!.lost_reason).toBe("Comprou em outra loja");

    await db.as(ownerId).rpc("crm_move_opportunity", {
      p_opportunity_id: opportunityId,
      p_stage_id: await firstStage("interessado"),
    });
    const [reopened] = await db
      .as(ownerId)
      .query<{ lost_at: string | null; lost_reason: string | null }>(
        "select lost_at, lost_reason from public.crm_opportunities where id = $1",
        [opportunityId],
      );
    expect(reopened!.lost_at).toBeNull();
    expect(reopened!.lost_reason).toBeNull();
  });

  it("moving to the same stage is a no-op (no duplicate timeline event)", async () => {
    const [row] = await db.as(ownerId).rpc<{ crm_create_opportunity: string }>("crm_create_opportunity", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
    });
    const opportunityId = row!.crm_create_opportunity;
    const stageId = await firstStage("novo");

    await db.as(ownerId).rpc("crm_move_opportunity", { p_opportunity_id: opportunityId, p_stage_id: stageId });

    const events = await db
      .as(ownerId)
      .query("select id from public.timeline_events where payload->>'opportunity_id' = $1", [opportunityId]);
    expect(events).toHaveLength(1); // só o crm.opportunity_created
  });

  it("rejects a stage from another tenant", async () => {
    const other = await db.createTenantWithOwner("Outra Loja");
    const otherStage = await db.admin
      .query<{ id: string }>("select id from public.crm_stages where tenant_id = $1 limit 1", [other.tenantId])
      .then((rows) => rows[0]!.id);

    const [row] = await db.as(ownerId).rpc<{ crm_create_opportunity: string }>("crm_create_opportunity", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
    });
    const opportunityId = row!.crm_create_opportunity;

    await expect(
      db.as(ownerId).rpc("crm_move_opportunity", { p_opportunity_id: opportunityId, p_stage_id: otherStage }),
    ).rejects.toThrow("invalid_input");
  });

  it("links products to an opportunity and replaces them via crm_set_opportunity_products", async () => {
    const { variantId: variantA } = await createProduct(db, ownerId, tenantId, { name: "Whey" });
    const { variantId: variantB } = await createProduct(db, ownerId, tenantId, { name: "Creatina" });

    const [row] = await db.as(ownerId).rpc<{ crm_create_opportunity: string }>("crm_create_opportunity", {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_variant_ids: [variantA],
    });
    const opportunityId = row!.crm_create_opportunity;

    let linked = await db
      .as(ownerId)
      .query<{ variant_id: string }>(
        "select variant_id from public.crm_opportunity_products where opportunity_id = $1",
        [opportunityId],
      );
    expect(linked.map((r) => r.variant_id)).toEqual([variantA]);

    await db
      .as(ownerId)
      .rpc("crm_set_opportunity_products", { p_opportunity_id: opportunityId, p_variant_ids: [variantB] });
    linked = await db
      .as(ownerId)
      .query("select variant_id from public.crm_opportunity_products where opportunity_id = $1", [opportunityId]);
    expect(linked.map((r) => r.variant_id)).toEqual([variantB]);
  });

  it("cannot move an opportunity belonging to another tenant (forbidden, not leaked as not_found)", async () => {
    const other = await db.createTenantWithOwner("Loja Vizinha");
    const [row] = await db.as(other.ownerId).rpc<{ crm_create_opportunity: string }>("crm_create_opportunity", {
      p_tenant_id: other.tenantId,
      p_customer_id: await db.admin
        .query<{ id: string }>(
          "insert into public.customers (tenant_id, name, phone) values ($1, $2, $3) returning id",
          [other.tenantId, "Cliente Vizinho", "11900001111"],
        )
        .then((rows) => rows[0]!.id),
    });
    const opportunityId = row!.crm_create_opportunity;

    await expect(
      db
        .as(sellerId)
        .rpc("crm_move_opportunity", { p_opportunity_id: opportunityId, p_stage_id: await firstStage("novo") }),
    ).rejects.toThrow("forbidden");
  });
});
