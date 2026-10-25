import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";
import type { ExportEntry } from "./report";

export type EntryStatus = "PENDING" | "PAID" | "CANCELED";
export type EntryKind = "INCOME" | "EXPENSE";

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
  category: string | null;
  amount: number;
  dueDate: string;
  installmentNumber: number;
  installmentCount: number;
  status: EntryStatus;
  paymentMethod: string | null;
  paidAt: string | null;
  canceledReason: string | null;
  fromContract: boolean;
  fromRecurring: boolean;
  /** Cobrança criada por um agendamento confirmado na Agenda. */
  fromAppointment: boolean;
}

export interface CustomerFinancialSummary {
  contracted: number;
  received: number;
  open: number;
  overdue: number;
}

const ENTRY_COLUMNS =
  "id, customer_id, description, category, amount, due_date, installment_number, installment_count, status, payment_method, paid_at, canceled_reason, signature_id, recurring_id, appointment_id";

type EntryRecord = {
  id: string;
  customer_id: string | null;
  description: string;
  category: string | null;
  amount: number;
  due_date: string;
  installment_number: number;
  installment_count: number;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
  canceled_reason: string | null;
  signature_id: string | null;
  recurring_id: string | null;
  appointment_id: string | null;
  customer?: { name: string } | null;
};

function toRow(row: EntryRecord): FinancialEntryRow {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer?.name ?? null,
    description: row.description,
    category: row.category,
    amount: Number(row.amount),
    dueDate: row.due_date,
    installmentNumber: row.installment_number,
    installmentCount: row.installment_count,
    status: row.status as EntryStatus,
    paymentMethod: row.payment_method,
    paidAt: row.paid_at,
    canceledReason: row.canceled_reason,
    fromContract: Boolean(row.signature_id),
    fromRecurring: Boolean(row.recurring_id),
    fromAppointment: Boolean(row.appointment_id),
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

/**
 * Parcelas com vencimento no período. Receita traz o nome da cliente e busca
 * por ele; despesa busca pela descrição.
 */
export async function listEntries(
  context: TenantContext,
  params: { kind: EntryKind; from: string; to: string; today: string; situation?: EntrySituation; search?: string },
): Promise<FinancialEntryRow[]> {
  const supabase = await createClient();
  const search = params.search?.trim().replace(/[%_,()]/g, " ").trim();
  const byCustomer = Boolean(search) && params.kind === "INCOME";
  let query = supabase
    .from("financial_entries")
    .select(`${ENTRY_COLUMNS}, customer:customers${byCustomer ? "!inner" : ""}(name)`)
    .eq("tenant_id", context.tenant.id)
    .eq("kind", params.kind)
    .gte("due_date", params.from)
    .lte("due_date", params.to);
  if (search) query = byCustomer ? query.ilike("customer.name", `%${search}%`) : query.ilike("description", `%${search}%`);
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
export async function listAttentionEntries(context: TenantContext, kind: EntryKind, today: string): Promise<FinancialEntryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_entries")
    .select(`${ENTRY_COLUMNS}, customer:customers(name)`)
    .eq("tenant_id", context.tenant.id)
    .eq("kind", kind)
    .eq("status", "PENDING")
    .lte("due_date", today)
    .order("due_date", { ascending: true })
    .limit(50);
  if (error) throw new Error(`listAttentionEntries failed: ${error.code}`);
  return (data ?? []).map((row) => toRow(row as unknown as EntryRecord));
}

export interface MonthSummary {
  /** Pago no mês, pelo dia do pagamento. */
  settled: number;
  /** Em aberto com vencimento no mês. */
  open: number;
  /** Tudo que vence no mês (pago ou não). */
  expected: number;
  /** Vencido e não pago, de qualquer mês. */
  overdue: number;
}

export async function getMonthSummary(
  context: TenantContext,
  params: { kind: EntryKind; from: string; to: string; today: string },
): Promise<MonthSummary> {
  const supabase = await createClient();
  const base = () =>
    supabase.from("financial_entries").select("amount, status").eq("tenant_id", context.tenant.id).eq("kind", params.kind);
  const [paid, due, overdue] = await Promise.all([
    base().eq("status", "PAID").gte("paid_at", params.from).lte("paid_at", params.to),
    base().neq("status", "CANCELED").gte("due_date", params.from).lte("due_date", params.to),
    base().eq("status", "PENDING").lt("due_date", params.today),
  ]);
  const error = paid.error ?? due.error ?? overdue.error;
  if (error) throw new Error(`getMonthSummary failed: ${error.code}`);
  const amounts = (rows: { amount: number }[] | null) => (rows ?? []).map((row) => ({ amount: Number(row.amount) }));
  const dueRows = due.data ?? [];
  return {
    settled: sumAmounts(amounts(paid.data)),
    open: sumAmounts(amounts(dueRows.filter((row) => row.status === "PENDING"))),
    expected: sumAmounts(amounts(dueRows)),
    overdue: sumAmounts(amounts(overdue.data)),
  };
}

/** Contagens para o sino: receitas atrasadas e vencendo hoje, contas a pagar vencidas ou de hoje. */
export async function getFinancialAlerts(
  context: TenantContext,
  today: string,
): Promise<{ overdue: number; dueToday: number; billsDue: number }> {
  const supabase = await createClient();
  const count = (kind: EntryKind, filter: "overdue" | "today" | "until_today") => {
    const query = supabase
      .from("financial_entries")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", context.tenant.id)
      .eq("kind", kind)
      .eq("status", "PENDING");
    if (filter === "overdue") return query.lt("due_date", today);
    if (filter === "today") return query.eq("due_date", today);
    return query.lte("due_date", today);
  };
  const [overdue, dueToday, billsDue] = await Promise.all([
    count("INCOME", "overdue"),
    count("INCOME", "today"),
    count("EXPENSE", "until_today"),
  ]);
  return { overdue: overdue.count ?? 0, dueToday: dueToday.count ?? 0, billsDue: billsDue.count ?? 0 };
}

export interface RecurringExpenseRow {
  id: string;
  description: string;
  category: string | null;
  amount: number;
  dayOfMonth: number;
  paymentMethod: string | null;
}

/** Despesas fixas ainda valendo; encerrada sai da lista (a parcela do mês atual continua). */
export async function listActiveRecurringExpenses(context: TenantContext): Promise<RecurringExpenseRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_recurring_expenses")
    .select("id, description, category, amount, day_of_month, payment_method")
    .eq("tenant_id", context.tenant.id)
    .is("ends_on", null)
    .order("description", { ascending: true });
  if (error) throw new Error(`listActiveRecurringExpenses failed: ${error.code}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    description: row.description,
    category: row.category,
    amount: Number(row.amount),
    dayOfMonth: row.day_of_month,
    paymentMethod: row.payment_method,
  }));
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Aluguel",
  "Água, luz e internet",
  "Equipamentos",
  "Impostos e taxas",
  "Manutenção",
  "Marketing",
  "Outros",
  "Produtos e insumos",
  "Salários e comissões",
];

/** Categorias sugeridas: as padrão mais as que já foram usadas (dá para digitar uma nova). */
export async function listExpenseCategories(context: TenantContext): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("financial_entries")
    .select("category")
    .eq("tenant_id", context.tenant.id)
    .eq("kind", "EXPENSE")
    .not("category", "is", null)
    .limit(1000);
  const used = (data ?? []).flatMap((row) => (row.category ? [row.category] : []));
  return [...new Set([...DEFAULT_EXPENSE_CATEGORIES, ...used])].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export interface CashFlowMonth {
  /** AAAA-MM */
  month: string;
  incomePaid: number;
  expensePaid: number;
  incomeOpen: number;
  expenseOpen: number;
}

export async function getCashFlow(context: TenantContext, from: string, to: string): Promise<CashFlowMonth[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("financial_cash_flow", { p_tenant_id: context.tenant.id, p_from: from, p_to: to });
  if (error) throw new Error(`getCashFlow failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    month: String(row.month).slice(0, 7),
    incomePaid: Number(row.income_paid),
    expensePaid: Number(row.expense_paid),
    incomeOpen: Number(row.income_open),
    expenseOpen: Number(row.expense_open),
  }));
}

export interface ReportGroup {
  label: string;
  amount: number;
  count: number;
}

export interface FinancialReport {
  income: number;
  expense: number;
  byProcedure: ReportGroup[];
  byMethod: ReportGroup[];
  byCategory: ReportGroup[];
  delinquency: { due: number; overdue: number; overdueCount: number };
}

type RawGroup = { label: string; amount: number | string; count: number };
type RawReport = {
  income: number | string;
  expense: number | string;
  by_procedure: RawGroup[];
  by_method: RawGroup[];
  by_category: RawGroup[];
  delinquency: { due: number | string; overdue: number | string; overdue_count: number };
};

export async function getFinancialReport(context: TenantContext, from: string, to: string): Promise<FinancialReport> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("financial_report", { p_tenant_id: context.tenant.id, p_from: from, p_to: to });
  if (error || !data) throw new Error(`getFinancialReport failed: ${error?.message}`);
  const raw = data as unknown as RawReport;
  const groups = (rows: RawGroup[]) => rows.map((row) => ({ label: row.label, amount: Number(row.amount), count: row.count }));
  return {
    income: Number(raw.income),
    expense: Number(raw.expense),
    byProcedure: groups(raw.by_procedure),
    byMethod: groups(raw.by_method),
    byCategory: groups(raw.by_category),
    delinquency: {
      due: Number(raw.delinquency.due),
      overdue: Number(raw.delinquency.overdue),
      overdueCount: raw.delinquency.overdue_count,
    },
  };
}

/** Lançamentos que vencem ou foram pagos no período, para a planilha do contador. */
export async function listEntriesForExport(context: TenantContext, from: string, to: string): Promise<ExportEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_entries")
    .select(`${ENTRY_COLUMNS}, kind, customer:customers(name)`)
    .eq("tenant_id", context.tenant.id)
    .or(`and(due_date.gte.${from},due_date.lte.${to}),and(paid_at.gte.${from},paid_at.lte.${to})`)
    .order("due_date", { ascending: true })
    .limit(10000);
  if (error) throw new Error(`listEntriesForExport failed: ${error.code}`);
  return (data ?? []).map((record) => {
    const row = toRow(record as unknown as EntryRecord);
    return {
      kind: (record as unknown as { kind: "INCOME" | "EXPENSE" }).kind,
      customerName: row.customerName,
      description: row.description,
      category: row.category,
      installmentNumber: row.installmentNumber,
      installmentCount: row.installmentCount,
      dueDate: row.dueDate,
      amount: row.amount,
      status: row.status,
      paidAt: row.paidAt,
      paymentMethod: row.paymentMethod,
      origin: row.fromContract
        ? "Contrato"
        : row.fromAppointment
          ? "Agenda"
          : row.fromRecurring
            ? "Despesa fixa"
            : "Lançamento manual",
    };
  });
}
