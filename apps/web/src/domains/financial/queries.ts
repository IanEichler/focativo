import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";

export type EntryStatus = "PENDING" | "PAID" | "CANCELED";

/** Filtro de situação da tela Financeiro; "atrasado" e "aberto" separam as pendentes pelo vencimento. */
export const ENTRY_SITUATIONS = [
  { value: "aberto", label: "Em aberto" },
  { value: "atrasado", label: "Atrasado" },
  { value: "pago", label: "Pago" },
  { value: "cancelado", label: "Cancelado" },
] as const;
export type EntrySituation = (typeof ENTRY_SITUATIONS)[number]["value"];

export interface FinancialEntryRow {
  id: string;
  customerId: string | null;
  customerName: string | null;
  description: string;
  amount: number;
  dueDate: string;
  installmentNumber: number;
  installmentCount: number;
  status: EntryStatus;
  paymentMethod: string | null;
  paidAt: string | null;
  canceledReason: string | null;
  fromContract: boolean;
}

export interface CustomerFinancialSummary {
  contracted: number;
  received: number;
  open: number;
  overdue: number;
}

const ENTRY_COLUMNS =
  "id, customer_id, description, amount, due_date, installment_number, installment_count, status, payment_method, paid_at, canceled_reason, signature_id";

type EntryRecord = {
  id: string;
  customer_id: string | null;
  description: string;
  amount: number;
  due_date: string;
  installment_number: number;
  installment_count: number;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
  canceled_reason: string | null;
  signature_id: string | null;
  customer?: { name: string } | null;
};

function toRow(row: EntryRecord): FinancialEntryRow {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer?.name ?? null,
    description: row.description,
    amount: Number(row.amount),
    dueDate: row.due_date,
    installmentNumber: row.installment_number,
    installmentCount: row.installment_count,
    status: row.status as EntryStatus,
    paymentMethod: row.payment_method,
    paidAt: row.paid_at,
    canceledReason: row.canceled_reason,
    fromContract: Boolean(row.signature_id),
  };
}

function sumAmounts(rows: Pick<FinancialEntryRow, "amount">[]): number {
  return Math.round(rows.reduce((total, row) => total + row.amount * 100, 0)) / 100;
}

export async function listCustomerEntries(context: TenantContext, customerId: string): Promise<FinancialEntryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_entries")
    .select(ENTRY_COLUMNS)
    .eq("tenant_id", context.tenant.id)
    .eq("customer_id", customerId)
    .eq("kind", "INCOME")
    .order("due_date", { ascending: true })
    .order("installment_number", { ascending: true });
  if (error) throw new Error(`listCustomerEntries failed: ${error.code}`);
  return (data ?? []).map(toRow);
}

/** `today` no fuso da clínica (AAAA-MM-DD): parcela pendente com vencimento anterior está atrasada. */
export function isOverdue(entry: Pick<FinancialEntryRow, "status" | "dueDate">, today: string): boolean {
  return entry.status === "PENDING" && entry.dueDate < today;
}

export function summarizeEntries(entries: FinancialEntryRow[], today: string): CustomerFinancialSummary {
  const active = entries.filter((entry) => entry.status !== "CANCELED");
  return {
    contracted: sumAmounts(active),
    received: sumAmounts(active.filter((entry) => entry.status === "PAID")),
    open: sumAmounts(active.filter((entry) => entry.status === "PENDING")),
    overdue: sumAmounts(active.filter((entry) => isOverdue(entry, today))),
  };
}

/** Parcelas com vencimento no período, com o nome da cliente; filtra por situação e nome. */
export async function listEntries(
  context: TenantContext,
  params: { from: string; to: string; today: string; situation?: EntrySituation; search?: string },
): Promise<FinancialEntryRow[]> {
  const supabase = await createClient();
  const search = params.search?.trim().replace(/[%_,()]/g, " ").trim();
  let query = supabase
    .from("financial_entries")
    .select(`${ENTRY_COLUMNS}, customer:customers${search ? "!inner" : ""}(name)`)
    .eq("tenant_id", context.tenant.id)
    .eq("kind", "INCOME")
    .gte("due_date", params.from)
    .lte("due_date", params.to);
  if (search) query = query.ilike("customer.name", `%${search}%`);
  if (params.situation === "pago") query = query.eq("status", "PAID");
  if (params.situation === "cancelado") query = query.eq("status", "CANCELED");
  if (params.situation === "aberto") query = query.eq("status", "PENDING").gte("due_date", params.today);
  if (params.situation === "atrasado") query = query.eq("status", "PENDING").lt("due_date", params.today);

  const { data, error } = await query
    .order("due_date", { ascending: true })
    .order("installment_number", { ascending: true })
    .limit(500);
  if (error) throw new Error(`listEntries failed: ${error.code}`);
  return (data ?? []).map((row) => toRow(row as unknown as EntryRecord));
}

/** Atrasadas e vencendo hoje, de qualquer mês — o que precisa de atenção agora. */
export async function listAttentionEntries(context: TenantContext, today: string): Promise<FinancialEntryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_entries")
    .select(`${ENTRY_COLUMNS}, customer:customers(name)`)
    .eq("tenant_id", context.tenant.id)
    .eq("kind", "INCOME")
    .eq("status", "PENDING")
    .lte("due_date", today)
    .order("due_date", { ascending: true })
    .limit(50);
  if (error) throw new Error(`listAttentionEntries failed: ${error.code}`);
  return (data ?? []).map((row) => toRow(row as unknown as EntryRecord));
}

export interface MonthSummary {
  received: number;
  receivable: number;
  expected: number;
  overdue: number;
}

/** Recebido pelo dia do pagamento; a receber e previsto pelo vencimento; atraso de qualquer mês. */
export async function getMonthSummary(
  context: TenantContext,
  params: { from: string; to: string; today: string },
): Promise<MonthSummary> {
  const supabase = await createClient();
  const base = () =>
    supabase.from("financial_entries").select("amount, status").eq("tenant_id", context.tenant.id).eq("kind", "INCOME");
  const [paid, due, overdue] = await Promise.all([
    base().eq("status", "PAID").gte("paid_at", params.from).lte("paid_at", params.to),
    base().neq("status", "CANCELED").gte("due_date", params.from).lte("due_date", params.to),
    base().eq("status", "PENDING").lt("due_date", params.today),
  ]);
  const error = paid.error ?? due.error ?? overdue.error;
  if (error) throw new Error(`getMonthSummary failed: ${error.code}`);
  const amounts = (rows: { amount: number }[] | null) => (rows ?? []).map((row) => ({ amount: Number(row.amount) }));
  const dueRows = (due.data ?? []) as { amount: number; status: string }[];
  return {
    received: sumAmounts(amounts(paid.data)),
    receivable: sumAmounts(amounts(dueRows.filter((row) => row.status === "PENDING"))),
    expected: sumAmounts(amounts(dueRows)),
    overdue: sumAmounts(amounts(overdue.data)),
  };
}

/** Contagens para o sino de notificações. */
export async function getFinancialAlerts(context: TenantContext, today: string): Promise<{ overdue: number; dueToday: number }> {
  const supabase = await createClient();
  const count = (filter: "overdue" | "today") => {
    const query = supabase
      .from("financial_entries")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", context.tenant.id)
      .eq("kind", "INCOME")
      .eq("status", "PENDING");
    return filter === "overdue" ? query.lt("due_date", today) : query.eq("due_date", today);
  };
  const [overdue, dueToday] = await Promise.all([count("overdue"), count("today")]);
  return { overdue: overdue.count ?? 0, dueToday: dueToday.count ?? 0 };
}
