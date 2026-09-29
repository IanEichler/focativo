import { expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(async () => ({ error: null })) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/domains/tenants/context", () => ({
  requireTenantContext: async () => ({ can: () => true, tenant: { id: "tenant" } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc }) }));
import { saveBusinessHoursAction } from "./actions";
it("sends a JSON array instead of a serialized string when saving the schedule", async () => {
  expect(
    (await saveBusinessHoursAction([{ dayOfWeek: 1, opensAt: "09:00", closesAt: "18:00", isClosed: false }])).status,
  ).toBe("success");
  expect(mock.rpc).toHaveBeenCalledWith("agenda_business_hours_set", {
    p_tenant_id: "tenant",
    p_hours: [{ day_of_week: 1, opens_at: "09:00", closes_at: "18:00", is_closed: false }],
  });
});
