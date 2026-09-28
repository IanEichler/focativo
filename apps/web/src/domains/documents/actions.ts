"use server";

import { revalidatePath } from "next/cache";
import { getCustomerDetail } from "@/domains/customers/queries";
import { requireTenantContext, type TenantContext } from "@/domains/tenants/context";
import { GENERIC_ERROR_MESSAGE, toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { CUSTOMER_DOCUMENTS_BUCKET, DOCUMENT_TEMPLATES_BUCKET, DOCX_MAX_BYTES, DOCX_MIME_TYPE } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, validationError } from "@/lib/validation";
import { mapKnownFields } from "./field-mapping";
import { fillTemplate } from "./fill-template";
import { getDocumentTemplate, getTenantFieldsForDocument } from "./queries";
import { generateDocumentSchema, uploadTemplateSchema, type UploadTemplateField } from "./schemas";
import { extractPlaceholders } from "./template-parser";

const DOCUMENTS_PATH = "/app/documentos";

function denied(context: TenantContext, event: string): ActionState<never> {
  logger.warn({ event, status: "denied", tenant_id: context.tenant.id, user_id: context.user.id });
  return { status: "error", message: toUserMessage({ message: "forbidden" }) };
}

export async function uploadDocumentTemplateAction(
  _prev: ActionState<UploadTemplateField>,
  formData: FormData,
): Promise<ActionState<UploadTemplateField>> {
  const context = await requireTenantContext();
  if (!context.can("documents.write")) return denied(context, "document_template.upload");

  const input = formDataToObject(formData);
  const parsed = uploadTemplateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, input);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Selecione um arquivo .docx." };
  }
  if (file.type !== DOCX_MIME_TYPE) {
    return { status: "error", message: "Formato não suportado. Envie um arquivo .docx." };
  }
  if (file.size > DOCX_MAX_BYTES) {
    return { status: "error", message: "Arquivo muito grande. O limite é 10 MB." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let fields: string[];
  try {
    fields = extractPlaceholders(buffer);
  } catch {
    return { status: "error", message: "Não foi possível ler esse arquivo. Confira se é um .docx válido." };
  }

  const supabase = await createClient();
  const path = `${context.tenant.id}/${crypto.randomUUID()}.docx`;
  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_TEMPLATES_BUCKET)
    .upload(path, buffer, { contentType: DOCX_MIME_TYPE, upsert: false });
  if (uploadError) {
    logger.warn({
      event: "document_template.upload",
      status: "error",
      tenant_id: context.tenant.id,
      reason: uploadError.name,
    });
    return { status: "error", message: GENERIC_ERROR_MESSAGE };
  }

  const { error } = await supabase.rpc("document_template_create", {
    p_tenant_id: context.tenant.id,
    p_name: parsed.data.name,
    p_file_path: path,
    p_fields: fields,
  });
  if (error) {
    await supabase.storage.from(DOCUMENT_TEMPLATES_BUCKET).remove([path]);
    return { status: "error", message: toUserMessage(error) };
  }

  revalidatePath(DOCUMENTS_PATH);
  return { status: "success", message: "Modelo cadastrado." };
}

export async function archiveDocumentTemplateAction(templateId: string): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.can("documents.write")) return denied(context, "document_template.archive");

  const supabase = await createClient();
  const { error } = await supabase.rpc("document_template_archive", { p_template_id: templateId });
  if (error) return { status: "error", message: toUserMessage(error) };

  revalidatePath(DOCUMENTS_PATH);
  return { status: "success", message: "Modelo arquivado." };
}

export interface FieldPreview {
  autoFilled: Record<string, string>;
  remaining: string[];
}

/** Recalcula sempre no servidor (nunca confia em nada vindo do cliente) — chamado tanto pela pré-visualização quanto pela geração final. */
async function computeFieldPreview(
  context: TenantContext,
  templateId: string,
  customerId: string,
): Promise<FieldPreview | { error: string }> {
  const [template, customer, tenantFields] = await Promise.all([
    getDocumentTemplate(context, templateId),
    getCustomerDetail(context, customerId),
    getTenantFieldsForDocument(context),
  ]);
  if (!template) return { error: "Modelo não encontrado." };
  if (!customer) return { error: "Cliente não encontrado." };

  return mapKnownFields(
    template.fields,
    {
      name: customer.name,
      phone: customer.phone,
      whatsapp: customer.whatsapp,
      email: customer.email,
      document: customer.document,
      birthday: customer.birthday,
    },
    tenantFields,
  );
}

export async function previewDocumentFieldsAction(
  templateId: string,
  customerId: string,
): Promise<FieldPreview | { error: string }> {
  const context = await requireTenantContext();
  if (!context.can("documents.read")) return { error: "Sem permissão." };
  return computeFieldPreview(context, templateId, customerId);
}

export type GenerateDocumentState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; fileBase64: string; fileName: string };

export const GENERATE_IDLE: GenerateDocumentState = { status: "idle" };

export async function generateDocumentAction(
  _prev: GenerateDocumentState,
  formData: FormData,
): Promise<GenerateDocumentState> {
  const context = await requireTenantContext();
  if (!context.can("documents.write")) return { status: "error", message: toUserMessage({ message: "forbidden" }) };

  const parsed = generateDocumentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: "Selecione o modelo e o cliente." };
  const { templateId, customerId, saveToProfile } = parsed.data;

  const [template, preview] = await Promise.all([
    getDocumentTemplate(context, templateId),
    computeFieldPreview(context, templateId, customerId),
  ]);
  if (!template) return { status: "error", message: "Modelo não encontrado." };
  if ("error" in preview) return { status: "error", message: preview.error };

  const data: Record<string, string> = { ...preview.autoFilled };
  for (const field of preview.remaining) {
    data[field] = String(formData.get(`field_${field}`) ?? "");
  }

  const supabase = await createClient();
  const { data: templateFile, error: downloadError } = await supabase.storage
    .from(DOCUMENT_TEMPLATES_BUCKET)
    .download(template.filePath);
  if (downloadError || !templateFile) {
    logger.warn({
      event: "document.generate",
      status: "error",
      tenant_id: context.tenant.id,
      code: downloadError?.name,
    });
    return { status: "error", message: GENERIC_ERROR_MESSAGE };
  }

  let outputBuffer: Buffer;
  try {
    outputBuffer = fillTemplate(Buffer.from(await templateFile.arrayBuffer()), data);
  } catch (renderError) {
    logger.warn({
      event: "document.generate",
      status: "error",
      tenant_id: context.tenant.id,
      code: String(renderError),
    });
    return { status: "error", message: "Não foi possível preencher esse modelo. Confira os campos do documento." };
  }

  const fileName = `${template.name}.docx`;

  if (saveToProfile) {
    const path = `${context.tenant.id}/${customerId}/${crypto.randomUUID()}.docx`;
    const { error: uploadError } = await supabase.storage
      .from(CUSTOMER_DOCUMENTS_BUCKET)
      .upload(path, outputBuffer, { contentType: DOCX_MIME_TYPE, upsert: false });
    if (!uploadError) {
      const { error: rpcError } = await supabase.rpc("customer_document_create", {
        p_customer_id: customerId,
        p_template_id: templateId,
        p_name: fileName,
        p_file_path: path,
      });
      if (rpcError) {
        await supabase.storage.from(CUSTOMER_DOCUMENTS_BUCKET).remove([path]);
        logger.warn({
          event: "document.generate_save",
          status: "error",
          tenant_id: context.tenant.id,
          code: rpcError.message,
        });
      } else {
        revalidatePath(`/app/clientes/${customerId}`);
      }
    }
  }

  return { status: "success", fileBase64: outputBuffer.toString("base64"), fileName };
}

export async function getCustomerDocumentDownloadUrlAction(documentId: string): Promise<string | null> {
  const context = await requireTenantContext();
  if (!context.can("documents.read")) return null;

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("customer_documents")
    .select("file_path")
    .eq("tenant_id", context.tenant.id)
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;

  const { data, error } = await supabase.storage.from(CUSTOMER_DOCUMENTS_BUCKET).createSignedUrl(doc.file_path, 60);
  if (error || !data) return null;
  return data.signedUrl;
}
