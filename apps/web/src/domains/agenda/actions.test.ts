import { expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(async () => ({ error: null, data: "created-appointment" })) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/domains/tenants/context", () => ({
  requireTenantContext: async () => ({ can: () => true, tenant: { id: "tenant" } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc }) }));
vi.mock("@/domains/tenants/queries", () => ({ getTenantDetails: async () => ({ timezone: "America/Cuiaba" }) }));
import { createAppointmentAction, saveBusinessHoursAction } from "./actions";
it("sends a JSON array instead of a serialized string when saving the schedule", async () => {
  expect(
    (await saveBusinessHoursAction([{ dayOfWeek: 1, opensAt: "09:00", closesAt: "18:00", isClosed: false }])).status,
  ).toBe("success");
  expect(mock.rpc).toHaveBeenCalledWith("agenda_business_hours_set", {
    p_tenant_id: "tenant",
    p_hours: [{ day_of_week: 1, opens_at: "09:00", closes_at: "18:00", is_closed: false }],
  });
});
it("persists a manual 09:00 appointment as 13:00 UTC in Cuiabá", async () => {
  const form = new FormData();
  for (const field of ["customerId", "serviceId", "professionalUserId"])
    form.set(field, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  form.set("startsAt", "2026-10-01T09:00");
  expect((await createAppointmentAction({ status: "idle" }, form)).status).toBe("success");
  expect(mock.rpc).toHaveBeenLastCalledWith(
    "agenda_appointment_create",
    expect.objectContaining({ p_starts_at: "2026-10-01T13:00:00.000Z", p_tenant_id: "tenant" }),
  );
});
