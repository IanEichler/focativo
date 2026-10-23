import { beforeAll, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";

const db = useTestDatabase();
let tenantId: string, ownerId: string;

beforeAll(async () => {
  ({ tenantId, ownerId } = await db.createTenantWithOwner("Financial expenses"));
  await db.admin.query("update public.tenants set timezone='America/Cuiaba' where id=$1", [tenantId]);
});

type Row = { id: string; kind: string; amount: string; due_date: string; status: string; customer_id: string | null };

function entries(filter: string, values: unknown[]) {
  return db.admin.query<Row>(
    `select id, kind, amount::text, to_char(due_date,'YYYY-MM-DD') as due_date, status, customer_id
     from public.financial_entries where tenant_id=$1 and ${filter} order by due_date`,
    [tenantId, ...values],
  );
}

async function today(): Promise<string> {
  const [row] = await db.admin.query<{ today: string }>(
    "select to_char(private.tenant_today($1),'YYYY-MM-DD') as today", [tenantId],
  );
  return row!.today;
}

it("creates expenses without a customer, split into monthly installments, sharing the pay flow", async () => {
  const [created] = await db.as(ownerId).rpc<{ financial_expense_create: number }>("financial_expense_create", {
    p_tenant_id: tenantId, p_description: "Aparelho de laser", p_total: 1000, p_first_due_date: "2100-01-10", p_installments: 3, p_category: "Equipamentos",
  });
  expect(created!.financial_expense_create).toBe(3);
  const rows = await entries("description='Aparelho de laser'", []);
  expect(rows.map((row) => [row.kind, row.amount, row.due_date, row.customer_id])).toEqual([
    ["EXPENSE", "333.34", "2100-01-10", null], ["EXPENSE", "333.33", "2100-02-10", null], ["EXPENSE", "333.33", "2100-03-10", null],
  ]);
  await db.as(ownerId).rpc("financial_entry_pay", { p_entry_id: rows[0]!.id, p_paid_at: "2026-10-01" });
  const [paid] = await entries("id=$2", [rows[0]!.id]);
  expect(paid!.status).toBe("PAID");
});

it("materializes a fixed expense through next month, clamps the day and never duplicates", async () => {
  const now = await today();
  const thisMonth = `${now.slice(0, 7)}-01`;
  const [created] = await db.as(ownerId).rpc<{ financial_recurring_create: string }>("financial_recurring_create", {
    p_tenant_id: tenantId, p_description: "Aluguel", p_amount: 2500, p_day_of_month: 31, p_first_month: thisMonth, p_category: "Aluguel",
  });
  const recurringId = created!.financial_recurring_create;
  let rows = await entries("recurring_id=$2", [recurringId]);
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    const [year, month] = row.due_date.split("-").map(Number) as [number, number];
    expect(Number(row.due_date.slice(8))).toBe(new Date(Date.UTC(year, month, 0)).getUTCDate());
    expect(row).toMatchObject({ kind: "EXPENSE", amount: "2500.00", status: "PENDING" });
  }

  const [sweep] = await db.service.rpc<{ financial_recurring_materialize_sweep: number }>("financial_recurring_materialize_sweep");
  expect(sweep!.financial_recurring_materialize_sweep).toBe(0);
  await expect(db.as(ownerId).rpc("financial_recurring_materialize_sweep")).rejects.toThrow();

  await db.as(ownerId).rpc("financial_recurring_end", { p_recurring_id: recurringId });
  rows = await entries("recurring_id=$2", [recurringId]);
  expect(rows.map((row) => row.status)).toEqual(["PENDING", "CANCELED"]);
  const [again] = await db.service.rpc<{ financial_recurring_materialize_sweep: number }>("financial_recurring_materialize_sweep");
  expect(again!.financial_recurring_materialize_sweep).toBe(0);
});

it("builds the monthly cash flow from payments, open entries and projected fixed expenses", async () => {
  const { tenantId: flowTenant, ownerId: flowOwner } = await db.createTenantWithOwner("Cash flow");
  const [customer] = await db.admin.query<{ id: string }>(
    "insert into public.customers(tenant_id,name,email) values($1,'Cliente fluxo','fluxo@example.test') returning id", [flowTenant],
  );
  await db.as(flowOwner).rpc("financial_entry_create", {
    p_tenant_id: flowTenant, p_customer_id: customer!.id, p_description: "Pacote", p_total: 600, p_first_due_date: "2100-01-05", p_installments: 2,
  });
  const [income] = await db.admin.query<{ id: string }>(
    "select id from public.financial_entries where tenant_id=$1 and due_date='2100-01-05'", [flowTenant],
  );
  await db.as(flowOwner).rpc("financial_entry_pay", { p_entry_id: income!.id, p_paid_at: "2026-10-01" });
  await db.as(flowOwner).rpc("financial_expense_create", {
    p_tenant_id: flowTenant, p_description: "Produtos", p_total: 100, p_first_due_date: "2100-02-20",
  });
  await db.admin.query(
    `insert into public.financial_recurring_expenses(tenant_id,description,amount,day_of_month,starts_on)
     values($1,'Luz',150,10,'2100-01-01')`, [flowTenant],
  );

  type FlowRow = { month: string; income_paid: string; expense_paid: string; income_open: string; expense_open: string };
  const cashFlow = async (from: string, to: string) => {
    const rows = await db.as(flowOwner).rpc<FlowRow>("financial_cash_flow", { p_tenant_id: flowTenant, p_from: from, p_to: to });
    return new Map(rows.map((row) => [new Date(row.month).toISOString().slice(0, 7), row]));
  };
  const paidMonth = await cashFlow("2026-10-01", "2026-10-31");
  expect(Number(paidMonth.get("2026-10")!.income_paid)).toBe(300);
  await expect(cashFlow("2026-01-01", "2100-01-01")).rejects.toThrow("invalid_input");
  const byMonth = await cashFlow("2100-01-01", "2100-02-28");
  expect(Number(byMonth.get("2100-01")!.income_open)).toBe(0);
  expect(Number(byMonth.get("2100-01")!.expense_open)).toBe(150);
  expect(Number(byMonth.get("2100-02")!.income_open)).toBe(300);
  expect(Number(byMonth.get("2100-02")!.expense_open)).toBe(250);

  const outsider = await db.createUser({ email: "cash-flow-outsider@example.test" });
  await expect(db.as(outsider).rpc("financial_cash_flow", { p_tenant_id: flowTenant, p_from: "2100-01-01", p_to: "2100-02-28" })).rejects.toThrow("forbidden");
  await expect(db.as(outsider).rpc("financial_expense_create", {
    p_tenant_id: flowTenant, p_description: "Intrusa", p_total: 10, p_first_due_date: "2100-01-01",
  })).rejects.toThrow("forbidden");
  expect(await db.as(outsider).query("select id from public.financial_recurring_expenses")).toHaveLength(0);
});

it("refuses an expense tied to a customer", async () => {
  const [customer] = await db.admin.query<{ id: string }>(
    "insert into public.customers(tenant_id,name,email) values($1,'Cliente despesa','despesa@example.test') returning id", [tenantId],
  );
  await expect(db.admin.query(
    "insert into public.financial_entries(tenant_id,customer_id,kind,description,amount,due_date) values($1,$2,'EXPENSE','Inválida',10,'2100-01-01')",
    [tenantId, customer!.id],
  )).rejects.toThrow("financial_entries_expense_customer_check");
});
