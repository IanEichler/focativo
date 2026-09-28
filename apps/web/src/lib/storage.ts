export const PRODUCT_IMAGES_BUCKET = "product-images";
export const PRODUCT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

// Buckets PRIVADOS (ao contrário de product-images) — contrato é documento
// sensível, nunca servido por URL pública direta, só por URL assinada.
export const DOCUMENT_TEMPLATES_BUCKET = "document-templates";
export const CUSTOMER_DOCUMENTS_BUCKET = "customer-documents";
export const DOCX_MAX_BYTES = 10 * 1024 * 1024;
export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** URL pública de uma imagem de catálogo (bucket público; escrita protegida por RLS). */
export function productImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${encoded}`;
}
