import { beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { useTestDatabase } from "../../src/harness/test-db";
const db = useTestDatabase();
let tenantId: string, ownerId: string, customerId: string, serviceId: string;
beforeAll(async () => {
  ({ tenantId, ownerId } = await db.createTenantWithOwner("Contract agenda"));
  await db.admin.query("update public.tenants set timezone='America/Cuiaba' where id=$1", [tenantId]);
  const [customer] = await db.admin.query<{ id: string }>("insert into public.customers(tenant_id,name,email) values($1,'Test customer','test@example.test') returning id", [tenantId]);
  customerId = customer!.id;
  const [service] = await db.as(ownerId).rpc<{ agenda_service_create: string }>("agenda_service_create", { p_tenant_id: tenantId, p_name: "Sessão teste", p_duration_minutes: 30, p_price: 100 });
  serviceId = service!.agenda_service_create;
});
const session = (date = "2100-01-04", time = "14:00") => ({ number: 1, date, time, serviceId, professionalId: ownerId, notes: "Teste" });
async function validate(items: object[], user = ownerId) {
  const [result] = await db.as(user).rpc("contract_validate_sessions", { p_tenant_id: tenantId, p_sessions: JSON.stringify(items) });
  return result!.contract_validate_sessions as Record<string, unknown>[];
}
async function request(plan: unknown[]) {
  const [document] = await db.as(ownerId).rpc<{ customer_document_create: string }>("customer_document_create", { p_customer_id: customerId, p_template_id: null, p_name: "Contract.docx", p_file_path: `${tenantId}/${randomUUID()}.docx` });
  const token = randomUUID();
  const [row] = await db.service.query<{ id: string }>(`insert into public.contract_signatures(tenant_id,customer_id,document_id,created_by,document_name,signer_name,original_path,original_sha256,status,token_hash,expires_at,viewed_at,session_plan)
    values($1,$2,$3,$4,'Test.pdf','Test customer','original.pdf',$5,'PENDING',$6,now()+interval '7 days',now(),$7::jsonb) returning id`,
  [tenantId, customerId, document!.customer_document_create, ownerId, "a".repeat(64), token, JSON.stringify(plan)]);
  return { id: row!.id, token };
}
async function sign(r: { id: string; token: string }) {
  const [result] = await db.service.rpc("signature_complete_link", { p_token_hash: r.token, p_signed_path: `${tenantId}/${r.id}/signed.pdf`, p_signed_sha256: "b".repeat(64), p_seal: "c".repeat(64),
    p_evidence: JSON.stringify({ requestId: r.id, originalSha256: "a".repeat(64), signerName: "Test customer", accepted: true, authentication: "unique_link", consentVersion: "2026-09-29-v3-location" }) });
  return result!.signature_complete_link;
}
it("waits for signature, uses clinic timezone and duration, and schedules only once", async () => {
  const plan = await validate([session()]);
  expect(new Date(String(plan[0]!.startsAt)).toISOString()).toBe("2100-01-04T18:00:00.000Z");
  const r = await request(plan);
  expect(await db.service.query("select id from public.contract_session_appointments where signature_id=$1", [r.id])).toHaveLength(0);
  await expect(db.service.query("update public.contract_signatures set session_plan='[]' where id=$1", [r.id])).rejects.toThrow("signature_snapshot_immutable");
  const results = await Promise.all([sign(r), sign(r)]);
  expect(results).toContainEqual({ ok: true }); expect(results).toContainEqual({ error: "unavailable" });
  const [row] = await db.service.query("select s.*,a.origin,a.customer_id as booked_customer from public.contract_session_appointments s join public.agenda_appointments a on a.id=s.appointment_id where s.signature_id=$1", [r.id]);
  expect(row).toMatchObject({ session_number: 1, origin: "contract_signature", booked_customer: customerId, error_code: null });
  expect(new Date(String(row!.ends_at)).getTime() - new Date(String(row!.starts_at)).getTime()).toBe(30 * 60000);
  const repeated = await db.as(ownerId).rpc("contract_session_retry", { p_session_id: row!.id });
  expect(repeated[0]!.contract_session_retry).toBe(row!.appointment_id);
});
it("keeps a signed session pending if another appointment takes its slot, then resolves without duplicates", async () => {
  const plan = await validate([session("2100-02-01")]);
  const r = await request(plan);
  await db.as(ownerId).rpc("agenda_appointment_create", { p_tenant_id: tenantId, p_customer_id: customerId, p_service_id: serviceId, p_professional_user_id: ownerId, p_starts_at: plan[0]!.startsAt });
  expect(await sign(r)).toEqual({ ok: true });
  const [pending] = await db.service.query("select * from public.contract_session_appointments where signature_id=$1", [r.id]);
  expect(pending).toMatchObject({ appointment_id: null, error_code: "slot_unavailable" });
  const changes = JSON.stringify(session("2100-02-01", "15:00"));
  const results = await Promise.all([db.as(ownerId).rpc("contract_session_retry", { p_session_id: pending!.id, p_changes: changes }), db.as(ownerId).rpc("contract_session_retry", { p_session_id: pending!.id, p_changes: changes })]);
  expect(results[0]![0]!.contract_session_retry).toBeTruthy();
  expect(results[1]![0]!.contract_session_retry).toBe(results[0]![0]!.contract_session_retry);
  const [snapshot] = await db.service.query("select status,session_plan from public.contract_signatures where id=$1", [r.id]);
  expect(snapshot).toMatchObject({ status: "SIGNED", session_plan: plan });
});
it("serializes two signed contracts competing for the same professional", async () => {
  const plan = await validate([session("2100-03-01")]);
  const a = await request(plan), b = await request(plan);
  expect(await Promise.all([sign(a), sign(b)])).toEqual([{ ok: true }, { ok: true }]);
  const rows = await db.service.query("select appointment_id,error_code from public.contract_session_appointments where signature_id=any($1::uuid[])", [[a.id, b.id]]);
  expect(rows.filter(row => row.appointment_id)).toHaveLength(1);
  expect(rows.filter(row => row.error_code === "slot_unavailable")).toHaveLength(1);
});
it("keeps contracts without dates, revoked contracts and expired links out of the agenda", async () => {
  const empty = await request([]); expect(await sign(empty)).toEqual({ ok: true });
  const revoked = await request(await validate([session("2100-04-01")]));
  await db.service.query("update public.contract_signatures set status='REVOKED' where id=$1", [revoked.id]);
  expect(await sign(revoked)).toEqual({ error: "unavailable" });
  const expired = await request(await validate([session("2100-05-01")]));
  await db.service.query("update public.contract_signatures set expires_at=now()-interval '1 second' where id=$1", [expired.id]);
  expect(await sign(expired)).toEqual({ error: "unavailable" });
  expect(await db.service.query("select id from public.contract_session_appointments where signature_id=any($1::uuid[])", [[empty.id, revoked.id, expired.id]])).toHaveLength(0);
});
it("rejects invalid dates, cross-tenant services, ineligible professionals and overlapping sessions before generation", async () => {
  await expect(validate([session("2020-01-01")])).rejects.toThrow("session_in_past");
  await expect(validate([session("2100-02-31")])).rejects.toThrow();
  await expect(validate([{ ...session(), serviceId: randomUUID() }])).rejects.toThrow("service_unavailable");
  await expect(validate([{ ...session(), professionalId: randomUUID() }])).rejects.toThrow("professional_unavailable");
  await expect(validate([session("2100-06-01"), { ...session("2100-06-01", "14:15"), number: 2 }])).rejects.toThrow("session_overlap");
});
it("respects changed business hours at signing and isolates pending sessions by tenant", async () => {
  const r = await request(await validate([session("2100-07-01")]));
  await db.admin.query("insert into public.tenant_business_hours(tenant_id,day_of_week,is_closed) values($1,extract(dow from date '2100-07-01'),true) on conflict(tenant_id,day_of_week) do update set is_closed=true", [tenantId]);
  expect(await sign(r)).toEqual({ ok: true });
  const [pending] = await db.service.query("select * from public.contract_session_appointments where signature_id=$1", [r.id]);
  expect(pending).toMatchObject({ appointment_id: null, error_code: "outside_business_hours" });
  const outsider = await db.createUser({ email: "contract-outsider@example.test" });
  await expect(validate([], outsider)).rejects.toThrow("forbidden");
  expect(await db.as(outsider).query("select id from public.contract_session_appointments")).toHaveLength(0);
  await expect(db.as(outsider).rpc("contract_session_retry", { p_session_id: pending!.id })).rejects.toThrow("forbidden");
  await expect(db.anon.query("select id from public.contract_session_appointments")).rejects.toThrow("permission denied");
  await expect(db.as(ownerId).query("delete from public.contract_session_appointments where id=$1", [pending!.id])).rejects.toThrow("permission denied");
});
