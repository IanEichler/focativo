import { beforeAll, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";

const db = useTestDatabase();
let tenantId: string, ownerId: string, customerId: string;

type Group = { label: string; amount: number; count: number };
type Report = {
  income: number;
  expense: number;
  by_procedure: Group[];
  by_method: Group[];
  by_category: Group[];
  delinquency: { due: number; overdue: number; overdue_count: number };
};

beforeAll(async () => {
  ({ tenantId, ownerId } = await db.createTenantWithOwner("Financial report"));
  const [customer] = await db.admin.query<{ id: string }>(
    "insert into public.customers(tenant_id,name,email) values($1,'Cliente relatório','relatorio@example.test') returning id", [tenantId],
  );
  customerId = customer!.id;

  const entry = (kind: string, description: string, amount: number, due: string, extra: Record<string, string | null> = {}) =>
    db.admin.query(
      `insert into public.financial_entries(tenant_id,customer_id,kind,description,amount,due_date,status,paid_at,payment_method,category)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [tenantId, kind === "INCOME" ? customerId : null, kind, description, amount, due,
        extra.status ?? "PENDING", extra.paid_at ?? null, extra.method ?? null, extra.category ?? null],
    );
  await entry("INCOME", "Pacote facial", 300, "2026-01-05", { status: "PAID", paid_at: "2026-01-06", method: "Pix" });
  await entry("INCOME", "Pacote facial", 300, "2026-02-05", { status: "PAID", paid_at: "2026-02-05", method: "Cartão de crédito" });
  await entry("INCOME", "Limpeza de pele", 150, "2026-02-10", { status: "PAID", paid_at: "2026-02-10", method: "Pix" });
  await entry("INCOME", "Laser", 200, "2026-02-12");
  await entry("INCOME", "Laser", 200, "2026-02-14", { status: "CANCELED" });
  await entry("INCOME", "Sem forma", 50, "2026-02-15", { status: "PAID", paid_at: "2026-02-15" });
  await entry("EXPENSE", "Aluguel", 1000, "2026-02-01", { status: "PAID", paid_at: "2026-02-01", category: "Aluguel" });
  await entry("EXPENSE", "Produtos", 120, "2026-02-03", { status: "PAID", paid_at: "2026-02-03" });
  await entry("EXPENSE", "Luz", 90, "2026-02-20");
});

async function report(from: string, to: string): Promise<Report> {
  const [row] = await db.as(ownerId).rpc<{ financial_report: Report }>("financial_report", { p_tenant_id: tenantId, p_from: from, p_to: to });
  return row!.financial_report;
}

it("groups paid income by procedure and method, expenses by category, by payment date", async () => {
  const result = await report("2026-02-01", "2026-02-28");
  expect(Number(result.income)).toBe(500);
  expect(Number(result.expense)).toBe(1120);
  expect(result.by_procedure.map((row) => [row.label, Number(row.amount), row.count])).toEqual([
    ["Pacote facial", 300, 1], ["Limpeza de pele", 150, 1], ["Sem forma", 50, 1],
  ]);
  expect(result.by_method.map((row) => [row.label, Number(row.amount)])).toEqual([
    ["Cartão de crédito", 300], ["Pix", 150], ["Não informado", 50],
  ]);
  expect(result.by_category.map((row) => [row.label, Number(row.amount)])).toEqual([["Aluguel", 1000], ["Sem categoria", 120]]);
});

it("measures delinquency on what fell due in the period, ignoring canceled", async () => {
  const { delinquency } = await report("2026-02-01", "2026-02-28");
  expect(Number(delinquency.due)).toBe(700);
  expect(Number(delinquency.overdue)).toBe(200);
  expect(delinquency.overdue_count).toBe(1);
});

it("checks permission and range", async () => {
  const outsider = await db.createUser({ email: "report-outsider@example.test" });
  await expect(db.as(outsider).rpc("financial_report", { p_tenant_id: tenantId, p_from: "2026-01-01", p_to: "2026-01-31" })).rejects.toThrow("forbidden");
  await expect(report("2026-02-01", "2026-01-01")).rejects.toThrow("invalid_input");
});
