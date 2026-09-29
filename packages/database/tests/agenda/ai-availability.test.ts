import { beforeAll, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";
const db = useTestDatabase();
let tenantId: string, ownerId: string, serviceId: string, conversationId: string;
const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
const stamp = (time: string) => `${date}T${time}:00-04:00`;
beforeAll(async () => {
  ({ tenantId, ownerId } = await db.createTenantWithOwner("AI booking"));
  await db.admin.query("update tenants set timezone='America/Cuiaba' where id=$1", [tenantId]);
  await db.admin.query("update tenant_module_flags set enabled=true where tenant_id=$1 and module_code='agenda'", [tenantId]);
  await db.as(ownerId).rpc("ai_settings_update", { p_tenant_id: tenantId, p_enabled: true });
  const [service] = await db.as(ownerId).rpc<{ agenda_service_create: string }>("agenda_service_create", { p_tenant_id: tenantId, p_name: "Avaliação", p_duration_minutes: 30, p_price: 0 });
  serviceId = service!.agenda_service_create;
  await db.admin.rpc("whatsapp_receive_message", { p_tenant_id: tenantId, p_whatsapp_number: "65998887766", p_content: "Olá", p_external_message_id: "availability-test" });
  conversationId = (await db.admin.query<{ id: string }>("select id from conversations where tenant_id=$1", [tenantId]))[0]!.id;
});
async function availability() {
  const [row] = await db.service.rpc<{ ai_agenda_availability: { status: string; timezone: string; slots: { starts_at: string; local_time: string; professional_user_id: string }[] } }>("ai_agenda_availability", { p_conversation_id: conversationId, p_service_id: serviceId, p_date: date, p_professional_user_id: ownerId });
  return row!.ai_agenda_availability;
}
const book = (time: string) => db.service.rpc("ai_agenda_book", { p_conversation_id: conversationId, p_service_id: serviceId, p_professional_user_id: ownerId, p_starts_at: stamp(time) });
it("does not invent availability or book when hours are not configured", async () => {
  expect(await availability()).toMatchObject({ status: "hours_not_configured", slots: [] });
  await expect(book("19:00")).rejects.toThrow("hours_not_configured");
});
it("offers only slots fitting the entire service duration in the clinic timezone", async () => {
  await db.as(ownerId).rpc("agenda_business_hours_set", { p_tenant_id: tenantId, p_hours: JSON.stringify([{ day_of_week: dow, opens_at: "09:00", closes_at: "18:00", is_closed: false }]) });
  const result = await availability();
  expect(result.timezone).toBe("America/Cuiaba");
  expect(result.slots[0]?.local_time).toBe("09:00");
  expect(result.slots.at(-1)?.local_time).toBe("17:30");
  expect(new Date(result.slots[0]!.starts_at).toISOString()).toBe(`${date}T13:00:00.000Z`);
  await expect(book("19:00")).rejects.toThrow("outside_business_hours");
  await expect(book("17:45")).rejects.toThrow("outside_business_hours");
});
it("books autonomously and excludes the occupied interval from later searches", async () => {
  await book("14:00");
  const result = await availability();
  expect(result.slots.map((s) => s.local_time)).not.toContain("14:00");
  expect(result.slots.map((s) => s.local_time)).not.toContain("13:45");
  expect(result.slots.map((s) => s.local_time)).toContain("14:30");
  expect((await db.admin.query("select status from conversations where id=$1", [conversationId]))[0]).toEqual({ status: "AI_ACTIVE" });
  await expect(book("14:15")).rejects.toThrow("slot_unavailable");
});
it("prevents simultaneous bookings from overlapping", async () => {
  const results = await Promise.allSettled([book("15:00"), book("15:15")]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
it("honors professional blocks", async () => {
  await db.admin.query("insert into agenda_professional_exceptions(tenant_id,professional_user_id,date) values($1,$2,$3)", [tenantId, ownerId, date]);
  expect((await availability()).slots).toEqual([]);
  await expect(book("16:00")).rejects.toThrow("professional_unavailable");
});
it("does not expose availability to client-side users", async () => {
  await expect(db.as(ownerId).rpc("ai_agenda_availability", { p_conversation_id: conversationId, p_service_id: serviceId, p_date: date })).rejects.toThrow("permission denied");
});
