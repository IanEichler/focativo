import { beforeAll, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";

const db = useTestDatabase();
let tenantId: string, ownerId: string, customerId: string, paidServiceId: string, freeServiceId: string;

beforeAll(async () => {
  ({ tenantId, ownerId } = await db.createTenantWithOwner("Appointment charges"));
  await db.admin.query("update public.tenants set timezone='America/Cuiaba' where id=$1", [tenantId]);
  const [customer] = await db.admin.query<{ id: string }>(
    "insert into public.customers(tenant_id,name,email) values($1,'Cliente agenda','agenda@example.test') returning id",
    [tenantId],
  );
  customerId = customer!.id;
  const [paid] = await db.as(ownerId).rpc<{ agenda_service_create: string }>("agenda_service_create", {
    p_tenant_id: tenantId,
    p_name: "Limpeza de pele",
    p_duration_minutes: 60,
    p_price: 180,
  });
  paidServiceId = paid!.agenda_service_create;
  const [free] = await db.as(ownerId).rpc<{ agenda_service_create: string }>("agenda_service_create", {
    p_tenant_id: tenantId,
    p_name: "Avaliação gratuita",
    p_duration_minutes: 30,
    p_price: 0,
  });
  freeServiceId = free!.agenda_service_create;
});

async function book(serviceId: string, startsAt: string) {
  const [row] = await db.as(ownerId).rpc<{ agenda_appointment_create: string }>("agenda_appointment_create", {
    p_tenant_id: tenantId,
    p_customer_id: customerId,
    p_service_id: serviceId,
    p_professional_user_id: ownerId,
    p_starts_at: startsAt,
  });
  return row!.agenda_appointment_create;
}

type Charge = {
  id: string;
  amount: string;
  due_date: string;
  status: string;
  description: string;
  customer_id: string;
  category: string;
};
async function chargeFor(appointmentId: string): Promise<Charge | undefined> {
  const [row] = await db.admin.query<Charge>(
    `select id, amount::text, to_char(due_date,'YYYY-MM-DD') as due_date, status, description, customer_id, category
     from public.financial_entries where appointment_id=$1`,
    [appointmentId],
  );
  return row;
}

it("creates one open charge when an appointment is confirmed, in the clinic's day, and lets it be paid", async () => {
  // 01:30 UTC de 11/01 ainda é 10/01 em Cuiabá (UTC-4).
  const appointmentId = await book(paidServiceId, "2100-01-11T01:30:00Z");
  expect(await chargeFor(appointmentId)).toBeUndefined();

  await db.as(ownerId).rpc("agenda_appointment_advance", { p_appointment_id: appointmentId, p_status: "CONFIRMED" });
  const charge = await chargeFor(appointmentId);
  expect(charge).toMatchObject({
    amount: "180.00",
    due_date: "2100-01-10",
    status: "PENDING",
    customer_id: customerId,
    category: "Atendimentos",
  });
  expect(charge!.description).toBe("Limpeza de pele · 10/01 21:30");

  await db.as(ownerId).rpc("agenda_appointment_advance", { p_appointment_id: appointmentId, p_status: "COMPLETED" });
  const rows = await db.admin.query("select id from public.financial_entries where appointment_id=$1", [appointmentId]);
  expect(rows).toHaveLength(1);

  await db
    .as(ownerId)
    .rpc("financial_entry_pay", { p_entry_id: charge!.id, p_paid_at: "2026-10-20", p_payment_method: "Pix" });
  expect((await chargeFor(appointmentId))!.status).toBe("PAID");
});

it("charges an appointment completed straight from scheduled", async () => {
  const appointmentId = await book(paidServiceId, "2100-02-03T14:00:00Z");
  await db.as(ownerId).rpc("agenda_appointment_advance", { p_appointment_id: appointmentId, p_status: "COMPLETED" });
  expect((await chargeFor(appointmentId))!.status).toBe("PENDING");
});

it("cancels the open charge on cancellation or no-show, but never touches a paid one", async () => {
  const canceled = await book(paidServiceId, "2100-03-03T14:00:00Z");
  await db.as(ownerId).rpc("agenda_appointment_advance", { p_appointment_id: canceled, p_status: "CONFIRMED" });
  await db.as(ownerId).rpc("agenda_appointment_cancel", { p_appointment_id: canceled, p_reason: "Remarcar" });
  expect((await chargeFor(canceled))!.status).toBe("CANCELED");

  const noShow = await book(paidServiceId, "2100-03-04T14:00:00Z");
  await db.as(ownerId).rpc("agenda_appointment_advance", { p_appointment_id: noShow, p_status: "CONFIRMED" });
  const charge = await chargeFor(noShow);
  await db.as(ownerId).rpc("financial_entry_pay", { p_entry_id: charge!.id, p_paid_at: "2026-10-20" });
  await db.as(ownerId).rpc("agenda_appointment_advance", { p_appointment_id: noShow, p_status: "NO_SHOW" });
  expect((await chargeFor(noShow))!.status).toBe("PAID");
});

it("skips free services and contract sessions", async () => {
  const free = await book(freeServiceId, "2100-04-03T14:00:00Z");
  await db.as(ownerId).rpc("agenda_appointment_advance", { p_appointment_id: free, p_status: "CONFIRMED" });
  expect(await chargeFor(free)).toBeUndefined();

  const contractSession = await book(paidServiceId, "2100-04-04T14:00:00Z");
  await db.admin.query("update public.agenda_appointments set origin='contract_signature' where id=$1", [
    contractSession,
  ]);
  await db.as(ownerId).rpc("agenda_appointment_advance", { p_appointment_id: contractSession, p_status: "CONFIRMED" });
  expect(await chargeFor(contractSession)).toBeUndefined();
});
