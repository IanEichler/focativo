"use server";

import type { GenerateDocumentState } from "./state";

import { revalidatePath } from "next/cache";
import { getCustomerDetail } from "@/domains/customers/queries";
import { requireTenantContext, type TenantContext } from "@/domains/tenants/context";
import { GENERIC_ERROR_MESSAGE, toUserMessage, type ActionState } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { CUSTOMER_DOCUMENTS_BUCKET, DOCUMENT_TEMPLATES_BUCKET, DOCX_MAX_BYTES, DOCX_MIME_TYPE } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, validationError } from "@/lib/validation";
import { mapKnownFields } from "./field-mapping";
import { contractFieldError } from "./field-format";
import { customerProfileExpected, customerProfileValues } from "./customer-profile-fields";
import { convertDocxToPdf } from "./convert-to-pdf";
import { fillTemplate } from "./fill-template";
import { getDocumentTemplate, getTenantFieldsForDocument } from "./queries";
import { generateDocumentSchema, uploadTemplateSchema, type UploadTemplateField } from "./schemas";
import { extractPlaceholders } from "./template-parser";
import { saveSigningSnapshot } from "@/domains/signatures/snapshot";
import { signingClient } from "@/domains/signatures/client";
import { downloadSignedContractAction, createSignatureLinkAction } from "@/domains/signatures/actions";
import { signingReadiness } from "@/domains/signatures/security";


function denied(context: TenantContext, event: string): ActionState<never> {
  logger.warn({ event, status: "denied", tenant_id: context.tenant.id, user_id: context.user.id });
  return { status: "error", message: toUserMessage({ message: "forbidden" }) };
}

export async function uploadDocumentTemplateAction(
  _prev: ActionState<UploadTemplateField>,
  formData: FormData,
): Promise<ActionState<UploadTemplateField>> {
  const context = await requireTenantContext();
  if (!context.hasModule("documents") || !context.can("documents.write")) {
    return denied(context, "document_template.upload");
  }

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

  revalidatePath("/app/clientes", "layout");
  return { status: "success", message: "Modelo cadastrado." };
}

export async function archiveDocumentTemplateAction(templateId: string): Promise<ActionState> {
  const context = await requireTenantContext();
  if (!context.hasModule("documents") || !context.can("documents.write")) {
    return denied(context, "document_template.archive");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("document_template_archive", { p_template_id: templateId });
  if (error) return { status: "error", message: toUserMessage(error) };

  revalidatePath("/app/clientes", "layout");
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
      rg: customer.rg,
      profession: customer.profession,
      address: customer.address,
      city_state: customer.city_state,
      postal_code: customer.postal_code,
    },
    tenantFields,
  );
}

export async function previewDocumentFieldsAction(
  templateId: string,
  customerId: string,
): Promise<FieldPreview | { error: string }> {
  const context = await requireTenantContext();
  if (!context.hasModule("documents") || !context.can("documents.read")) return { error: "Sem permissão." };
  return computeFieldPreview(context, templateId, customerId);
}

export async function generateDocumentAction(
  _prev: GenerateDocumentState,
  formData: FormData,
): Promise<GenerateDocumentState> {
  const context = await requireTenantContext();
  if (!context.hasModule("documents") || !context.can("documents.write")) {
    return { status: "error", message: toUserMessage({ message: "forbidden" }) };
  }

  const parsed = generateDocumentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: "Selecione o modelo e o cliente." };
  const { templateId, customerId, saveToProfile } = parsed.data;

  const [template, preview, customer] = await Promise.all([
    getDocumentTemplate(context, templateId),
    computeFieldPreview(context, templateId, customerId),
    getCustomerDetail(context, customerId),
  ]);
  if (!template) return { status: "error", message: "Modelo não encontrado." };
  if ("error" in preview) return { status: "error", message: preview.error };
  if (!customer) return { status: "error", message: "Cliente não encontrado." };

  const data: Record<string, string> = {};
  for (const field of template.fields) {
    const value = String(formData.get(`field_${field}`) ?? preview.autoFilled[field] ?? "").trim();
    if (value.length > 2000) return { status: "error", message: `O campo ${field} está muito longo.` };
    const fieldError = contractFieldError(field, value);
    if (fieldError) return { status: "error", message: `${field.replaceAll("_", " ")}: ${fieldError}` };
    data[field] = value;
  }
  if (template.fields.includes("data_assinatura") && !data.data_assinatura) data.data_assinatura = "____/____/______";
  if (template.fields.includes("data_assinatura_extenso") && !data.data_assinatura_extenso) {
    data.data_assinatura_extenso = "____ de __________ de ______";
  }
  let profileValues: Record<string, string> = {};
  if (context.can("customers.write")) {
    try {
      profileValues = customerProfileValues(data, customer);
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Confira os dados pessoais da cliente.",
      };
    }
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
  let pdfBuffer: Buffer;
  try {
    outputBuffer = fillTemplate(Buffer.from(await templateFile.arrayBuffer()), data);
    pdfBuffer = await convertDocxToPdf(outputBuffer);
  } catch (renderError) {
    logger.warn({
      event: "document.generate",
      status: "error",
      tenant_id: context.tenant.id,
      code: String(renderError),
    });
    return {
      status: "error",
      message: "Não foi possível gerar o contrato em DOCX e PDF. Confira o modelo e o conversor de PDF do servidor.",
    };
  }

  const fileName = `${template.name}.docx`;
  let signatureDocumentId: string | undefined;
  let signatureUrl: string | undefined;
  let signatureWarning: string | undefined;

  if (saveToProfile) {
    const path = `${context.tenant.id}/${customerId}/${crypto.randomUUID()}.docx`;
    const { error: uploadError } = await supabase.storage
      .from(CUSTOMER_DOCUMENTS_BUCKET)
      .upload(path, outputBuffer, { contentType: DOCX_MIME_TYPE, upsert: false });
    if (uploadError) {
      logger.warn({
        event: "document.generate_save",
        status: "error",
        tenant_id: context.tenant.id,
        code: uploadError.name,
      });
      return { status: "error", message: "Não foi possível salvar o contrato no perfil da cliente." };
    }
    const { data: savedDocumentId, error: rpcError } = await supabase.rpc("customer_document_create", {
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
      return { status: "error", message: "Não foi possível salvar o contrato no perfil da cliente." };
    }
    if (savedDocumentId) {
      try {
        await saveSigningSnapshot(context, savedDocumentId, customerId, fileName, pdfBuffer, data, customer);
        signatureDocumentId = savedDocumentId;
        if (!signingReadiness()) {
          const link = await createSignatureLinkAction(savedDocumentId);
          if (link.status === "success") signatureUrl = link.url;
          else signatureWarning = link.message;
        }
      } catch {
        signatureWarning = "O contrato foi salvo, mas não foi possível preparar a assinatura eletrônica. Os downloads continuam disponíveis.";
      }
    }
    revalidatePath(`/app/clientes/${customerId}`);
  }

  let profileMessage: string | undefined;
  let profileWarning = false;
  if (!context.can("customers.write")) {
    profileMessage = "O contrato foi gerado, mas seu acesso não permite atualizar o cadastro da cliente.";
    profileWarning = true;
  } else if (Object.keys(profileValues).length) {
    const { data: updatedCount, error: profileError } = await supabase.rpc("customer_sync_from_contract", {
      p_customer_id: customerId,
      p_values: profileValues,
      p_expected: customerProfileExpected(profileValues, customer),
    });
    if (profileError) {
      logger.warn({ event: "document.customer_profile_fill", tenant_id: context.tenant.id, code: profileError.code });
      profileMessage = profileError.code === "40001"
        ? "Contrato gerado, mas o perfil foi alterado durante a geração. Confira o cadastro e gere novamente para aplicar os dados do contrato."
        : `Contrato gerado. Não foi possível atualizar o perfil da cliente: ${toUserMessage(profileError)}`;
      profileWarning = true;
    } else if (updatedCount) {
      profileMessage = "Perfil da cliente atualizado com os dados pessoais preenchidos no contrato.";
      revalidatePath(`/app/clientes/${customerId}`);
      revalidatePath("/app/clientes");
      revalidatePath("/app/atendimento", "layout");
    } else {
      profileMessage = "Os dados pessoais do perfil já estão atualizados.";
    }
  } else {
    profileMessage = "Nenhuma alteração de dados pessoais para salvar no perfil.";
  }

  return {
    status: "success",
    docxBase64: outputBuffer.toString("base64"),
    pdfBase64: pdfBuffer.toString("base64"),
    fileName,
    profileMessage,
    profileWarning,
    signatureDocumentId,
    signatureUrl,
    signatureWarning,
  };
}

export async function getCustomerDocumentPdfAction(
  documentId: string,
): Promise<{ status: "success"; fileBase64: string; fileName: string } | { status: "error" }> {
  const context = await requireTenantContext();
  if (!context.can("documents.read") || !context.hasModule("documents")) return { status: "error" };

  const supabase = await createClient();
  const { data: document } = await supabase
    .from("customer_documents")
    .select("name, file_path")
    .eq("tenant_id", context.tenant.id)
    .eq("id", documentId)
    .maybeSingle();
  if (!document) return { status: "error" };
  const signature = await signingClient().from("contract_signatures").select("status")
    .eq("document_id", documentId).eq("tenant_id", context.tenant.id).maybeSingle();
  if (signature.error) return { status: "error" };
  if (signature.data?.status === "SIGNED") {
    const result = await downloadSignedContractAction(documentId);
    return result.status === "success"
      ? { status: "success", fileBase64: result.base64, fileName: result.name }
      : { status: "error" };
  }

  const { data: file, error } = await supabase.storage.from(CUSTOMER_DOCUMENTS_BUCKET).download(document.file_path);
  if (error || !file) return { status: "error" };
  try {
    const pdf = await convertDocxToPdf(Buffer.from(await file.arrayBuffer()));
    return {
      status: "success",
      fileBase64: pdf.toString("base64"),
      fileName: document.name.replace(/\.docx$/i, ".pdf"),
    };
  } catch (conversionError) {
    logger.warn({
      event: "document.download_pdf",
      status: "error",
      tenant_id: context.tenant.id,
      code: String(conversionError),
    });
    return { status: "error" };
  }
}

export async function getCustomerDocumentDownloadUrlAction(documentId: string): Promise<string | null> {
  const context = await requireTenantContext();
  if (!context.can("documents.read") || !context.hasModule("documents")) return null;

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("customer_documents")
    .select("file_path")
    .eq("tenant_id", context.tenant.id)
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;
  const signature = await signingClient().from("contract_signatures").select("status")
    .eq("document_id", documentId).eq("tenant_id", context.tenant.id).maybeSingle();
  if (signature.error || signature.data?.status === "SIGNED") return null;

  const { data, error } = await supabase.storage
    .from(CUSTOMER_DOCUMENTS_BUCKET)
    .createSignedUrl(doc.file_path, 60, { download: true });
  if (error || !data) return null;
  return data.signedUrl;
}
