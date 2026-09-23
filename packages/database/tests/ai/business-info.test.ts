import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useTestDatabase } from "../../src/harness/test-db";

describe("IA: conhecimento de negócio estruturado (tenant_ai_business_info)", () => {
  const db = useTestDatabase();
  let tenantId: string;
  let ownerId: string;
  let sellerId: string;

  beforeAll(async () => {
    const owner = await db.createTenantWithOwner("Clínica Conhecimento");
    tenantId = owner.tenantId;
    ownerId = owner.ownerId;
    sellerId = await db.addActiveMember(tenantId, "VENDEDOR");
  });

  it("defaults to empty when no row exists yet", async () => {
    const [row] = await db
      .as(ownerId)
      .rpc<{ business_description: string | null; faq: unknown[]; screening_flow: unknown[] }>("ai_business_info_get", {
        p_tenant_id: tenantId,
      });
    expect(row!.business_description).toBeNull();
    expect(row!.faq).toEqual([]);
    expect(row!.screening_flow).toEqual([]);
  });

  it("rejects a caller without tenant.update", async () => {
    await expectDbError(db.as(sellerId).rpc("ai_business_info_get", { p_tenant_id: tenantId }), "forbidden");
    await expectDbError(db.as(sellerId).rpc("ai_business_info_update", { p_tenant_id: tenantId }), "forbidden");
  });

  it("sets and reads back business description, policies, faq and screening flow", async () => {
    const faq = JSON.stringify([{ question: "Vocês atendem aos sábados?", answer: "Sim, das 9h às 13h." }]);
    const screeningFlow = JSON.stringify([
      "Se apresentar e perguntar se já é cliente",
      "Perguntar qual serviço deseja",
    ]);

    const [row] = await db
      .as(ownerId)
      .rpc<{ business_description: string; faq: { question: string }[]; screening_flow: string[] }>(
        "ai_business_info_update",
        {
          p_tenant_id: tenantId,
          p_business_description: "Clínica de estética facial e corporal.",
          p_general_policies: "Cancelamento com 24h de antecedência.",
          p_faq: faq,
          p_screening_flow: screeningFlow,
        },
      );
    expect(row!.business_description).toBe("Clínica de estética facial e corporal.");
    expect(row!.faq).toHaveLength(1);
    expect(row!.faq[0]!.question).toBe("Vocês atendem aos sábados?");
    expect(row!.screening_flow).toHaveLength(2);

    const [fetched] = await db.as(ownerId).rpc<{ general_policies: string }>("ai_business_info_get", {
      p_tenant_id: tenantId,
    });
    expect(fetched!.general_policies).toBe("Cancelamento com 24h de antecedência.");
  });

  it("rejects a faq item missing question/answer", async () => {
    await expectDbError(
      db.as(ownerId).rpc("ai_business_info_update", {
        p_tenant_id: tenantId,
        p_faq: JSON.stringify([{ question: "Só pergunta, sem resposta" }]),
      }),
      "invalid_input",
    );
  });

  it("rejects more than 20 faq items", async () => {
    const faq = JSON.stringify(
      Array.from({ length: 21 }, (_, i) => ({ question: `Pergunta ${i}`, answer: `Resposta ${i}` })),
    );
    await expectDbError(
      db.as(ownerId).rpc("ai_business_info_update", { p_tenant_id: tenantId, p_faq: faq }),
      "invalid_input",
    );
  });

  it("rejects more than 12 screening flow steps", async () => {
    const flow = JSON.stringify(Array.from({ length: 13 }, (_, i) => `Passo ${i}`));
    await expectDbError(
      db.as(ownerId).rpc("ai_business_info_update", { p_tenant_id: tenantId, p_screening_flow: flow }),
      "invalid_input",
    );
  });

  it("rejects a non-array shape for faq or screening_flow", async () => {
    await expectDbError(
      db.as(ownerId).rpc("ai_business_info_update", { p_tenant_id: tenantId, p_faq: JSON.stringify({ a: 1 }) }),
      "invalid_input",
    );
  });
});
