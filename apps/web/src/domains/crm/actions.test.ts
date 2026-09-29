import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  can: vi.fn(),
  hasModule: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/domains/tenants/context", () => ({
  requireTenantContext: async () => ({ tenant: { id: "tenant" }, can: mocks.can, hasModule: mocks.hasModule }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));
import { moveOpportunityAction } from "./actions";

const opportunityId = "00000000-0000-4000-8000-000000000001";
const stageId = "00000000-0000-4000-8000-000000000002";
const customerId = "00000000-0000-4000-8000-000000000003";

describe("changing CRM stage from the conversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.can.mockReturnValue(true);
    mocks.hasModule.mockReturnValue(true);
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it("persists the stage and optional loss reason, refreshing CRM, inbox and customer profile", async () => {
    const result = await moveOpportunityAction(opportunityId, stageId, customerId, "Desistiu");
    expect(result.status).toBe("success");
    expect(mocks.rpc).toHaveBeenCalledWith("crm_move_opportunity", {
      p_opportunity_id: opportunityId,
      p_stage_id: stageId,
      p_lost_reason: "Desistiu",
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/app/crm"],
      ["/app/atendimento"],
      [`/app/clientes/${customerId}`],
    ]);
  });

  it.each(["permission", "module"])("rejects changing the stage without the required %s", async (restriction) => {
    (restriction === "permission" ? mocks.can : mocks.hasModule).mockReturnValue(false);
    expect((await moveOpportunityAction(opportunityId, stageId, customerId)).status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reports a failed save without announcing a successful update", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "forbidden" } });
    expect((await moveOpportunityAction(opportunityId, stageId, customerId)).status).toBe("error");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
