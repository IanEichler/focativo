import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";

export type EntryStatus = "PENDING" | "PAID" | "CANCELED";

export interface FinancialEntryRow {
  id: string;
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

export async function listCustomerEntries(context: TenantContext, customerId: string): Promise<FinancialEntryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_entries")
    .select("id, description, amount, due_date, installment_number, installment_count, status, payment_method, paid_at, canceled_reason, signature_id")
    .eq("tenant_id", context.tenant.id)
    .eq("customer_id", customerId)
    .eq("kind", "INCOME")
    .order("due_date", { ascending: true })
    .order("installment_number", { ascending: true });
  if (error) throw new Error(`listCustomerEntries failed: ${error.code}`);

  return (data ?? []).map((row) => ({
    id: row.id,
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
  }));
}

/** `today` no fuso da clínica (AAAA-MM-DD): parcela pendente com vencimento anterior está atrasada. */
export function isOverdue(entry: Pick<FinancialEntryRow, "status" | "dueDate">, today: string): boolean {
  return entry.status === "PENDING" && entry.dueDate < today;
}

export function summarizeEntries(entries: FinancialEntryRow[], today: string): CustomerFinancialSummary {
  const active = entries.filter((entry) => entry.status !== "CANCELED");
  const sum = (rows: FinancialEntryRow[]) => Math.round(rows.reduce((total, row) => total + row.amount * 100, 0)) / 100;
  return {
    contracted: sum(active),
    received: sum(active.filter((entry) => entry.status === "PAID")),
    open: sum(active.filter((entry) => entry.status === "PENDING")),
    overdue: sum(active.filter((entry) => isOverdue(entry, today))),
  };
}
