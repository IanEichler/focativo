import "server-only";
import type { TenantContext } from "@/domains/tenants/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantFieldsInput } from "./field-mapping";

export interface DocumentTemplateRow {
  id: string;
  name: string;
  filePath: string;
  fields: string[];
  createdAt: string;
}

export async function listDocumentTemplates(context: TenantContext): Promise<DocumentTemplateRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_templates")
    .select("id, name, file_path, fields, created_at")
    .eq("tenant_id", context.tenant.id)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw new Error(`listDocumentTemplates failed: ${error.code}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    filePath: row.file_path,
    fields: Array.isArray(row.fields) ? (row.fields as string[]) : [],
    createdAt: row.created_at,
  }));
}

export async function getDocumentTemplate(
  context: TenantContext,
  templateId: string,
): Promise<DocumentTemplateRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_templates")
    .select("id, name, file_path, fields, created_at")
    .eq("tenant_id", context.tenant.id)
    .eq("id", templateId)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    filePath: data.file_path,
    fields: Array.isArray(data.fields) ? (data.fields as string[]) : [],
    createdAt: data.created_at,
  };
}

export async function getTenantFieldsForDocument(context: TenantContext): Promise<TenantFieldsInput> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants")
    .select("name, legal_name, document, email, phone")
    .eq("id", context.tenant.id)
    .single();

  return {
    name: data?.name ?? context.tenant.name,
    legalName: data?.legal_name ?? null,
    document: data?.document ?? null,
    email: data?.email ?? null,
    phone: data?.phone ?? null,
  };
}

export interface CustomerDocumentRow {
  id: string;
  name: string;
  templateName: string | null;
  filePath: string;
  createdAt: string;
}

export async function listCustomerDocuments(
  context: TenantContext,
  customerId: string,
): Promise<CustomerDocumentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_documents")
    .select("id, name, file_path, created_at, template:document_templates(name)")
    .eq("tenant_id", context.tenant.id)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listCustomerDocuments failed: ${error.code}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    templateName: row.template?.name ?? null,
    filePath: row.file_path,
    createdAt: row.created_at,
  }));
}
