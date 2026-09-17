import { z } from "zod";
import { isValidCpfOrCnpj, onlyDigits } from "@/lib/br-documents";
import { checkboxValue, optionalDecimal, optionalUuid, requiredDecimal } from "@/lib/decimal";
import { PRODUCT_UNITS } from "./labels";

const unitValues = PRODUCT_UNITS.map((unit) => unit.value) as [string, ...string[]];
const infoSources = ["LABEL", "MANUFACTURER", "TECHNICAL_SHEET", "MANUAL"] as const;

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value ? value : null));

const sku = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value.toUpperCase() : null))
  .refine((value) => value === null || /^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(value), "SKU inválido: use letras, números, . _ / -");

const barcode = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value.replace(/\s/g, "") : null))
  .refine((value) => value === null || /^[A-Za-z0-9]{4,64}$/.test(value), "Código de barras inválido.");

const money = (label: string) => optionalDecimal({ label, max: 9_999_999_999.99, scale: 2 });
const quantity = (label: string) => optionalDecimal({ label, max: 99_999_999_999.999, scale: 3 });

// -----------------------------------------------------------------------------
// Produto
// -----------------------------------------------------------------------------

export const productSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome (mín. 2 caracteres).").max(160, "Nome muito longo."),
    description: optionalText(5000, "Descrição muito longa."),
    categoryId: optionalUuid,
    brandId: optionalUuid,
    supplierId: optionalUuid,
    unit: z.enum(unitValues, { message: "Unidade inválida." }),
    salePrice: requiredDecimal({ label: "Preço de venda", max: 9_999_999_999.99, scale: 2 }),
    promoPrice: money("Preço promocional"),
    costPrice: money("Custo"),
    minStock: quantity("Estoque mínimo").transform((value) => value ?? 0),
    sku,
    barcode,
    trackLots: checkboxValue,
    isActive: checkboxValue,
    canEditCost: checkboxValue,
  })
  .refine((data) => data.promoPrice === null || data.promoPrice < data.salePrice, {
    message: "O preço promocional deve ser menor que o preço de venda.",
    path: ["promoPrice"],
  });

export type ProductField = keyof z.input<typeof productSchema>;

export const productIdSchema = z.uuid();

export const variantSchema = z.object({
  productId: z.uuid(),
  variantId: optionalUuid,
  name: z.string().trim().min(1, "Informe o nome da variação.").max(80, "Nome muito longo."),
  sku,
  barcode,
  salePrice: money("Preço de venda"),
  promoPrice: money("Preço promocional"),
  costPrice: money("Custo"),
  minStock: quantity("Estoque mínimo"),
  isActive: checkboxValue,
  canEditCost: checkboxValue,
});

export type VariantField = keyof z.input<typeof variantSchema>;

// -----------------------------------------------------------------------------
// Cadastros
// -----------------------------------------------------------------------------

export const categorySchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(1, "Informe o nome.").max(80, "Nome muito longo."),
  parentId: optionalUuid,
  description: optionalText(500, "Descrição muito longa."),
  isActive: checkboxValue,
});

export const brandSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(1, "Informe o nome.").max(80, "Nome muito longo."),
  isActive: checkboxValue,
});

export const supplierSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2, "Informe o nome.").max(120, "Nome muito longo."),
  legalName: optionalText(160, "Razão social muito longa."),
  document: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? onlyDigits(value) : null))
    .refine((value) => value === null || isValidCpfOrCnpj(value), "CPF ou CNPJ inválido."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || z.email().safeParse(value).success, "E-mail inválido."),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? onlyDigits(value) : null))
    .refine((value) => value === null || (value.length >= 10 && value.length <= 13), "Telefone inválido."),
  contactName: optionalText(120, "Nome muito longo."),
  notes: optionalText(1000, "Observações muito longas."),
  isActive: checkboxValue,
});

const attributeCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{1,49}$/, "Código: letras minúsculas, números e _, começando por letra.");

export const attributeSchema = z
  .object({
    id: optionalUuid,
    code: attributeCode.optional(),
    name: z.string().trim().min(1, "Informe o nome.").max(60, "Nome muito longo."),
    description: optionalText(300, "Descrição muito longa."),
    dataType: z.enum(["BOOLEAN", "NUMBER", "TEXT", "ENUM"]).optional(),
    unit: optionalText(16, "Unidade muito longa."),
    groupName: optionalText(40, "Grupo muito longo."),
    isSearchable: checkboxValue,
    isFilterable: checkboxValue,
    isCompatibilityEnabled: checkboxValue,
    isVariantAxis: checkboxValue,
    isActive: checkboxValue,
  })
  .superRefine((data, ctx) => {
    if (!data.id && !data.code) ctx.addIssue({ code: "custom", path: ["code"], message: "Informe o código." });
    if (!data.id && !data.dataType) ctx.addIssue({ code: "custom", path: ["dataType"], message: "Selecione o tipo." });
  });

export const attributeOptionSchema = z.object({
  id: optionalUuid,
  attributeId: z.uuid(),
  code: attributeCode.optional(),
  label: z.string().trim().min(1, "Informe o rótulo.").max(60, "Rótulo muito longo."),
  isActive: checkboxValue,
});

// -----------------------------------------------------------------------------
// Características
// -----------------------------------------------------------------------------

export const allergenEntrySchema = z
  .object({
    code: z.string().regex(/^[a-z][a-z_]{1,39}$/),
    presence: z.enum(["TRUE", "FALSE", "UNKNOWN"]),
    mayContainTraces: z.boolean(),
    source: z.enum(infoSources),
    notes: z.string().trim().max(300).nullable(),
  })
  .refine((entry) => !entry.mayContainTraces || entry.presence === "FALSE", {
    message: "“Pode conter traços” só se aplica quando o produto não contém o alérgeno.",
    path: ["mayContainTraces"],
  });

export const nutritionSchema = z.object({
  servingSize: requiredDecimal({ label: "Porção", min: 0, exclusiveMin: true, max: 99_999_999, scale: 2 }),
  servingUnit: z.enum(["g", "ml", "un"], { message: "Unidade da porção inválida." }),
  servingDescription: optionalText(80, "Descrição da porção muito longa."),
  servingsPerContainer: optionalDecimal({
    label: "Porções por embalagem",
    min: 0,
    exclusiveMin: true,
    max: 99_999_999,
    scale: 2,
  }),
  source: z.enum(infoSources, { message: "Informe a origem da informação." }),
  sourceNotes: optionalText(300, "Observação muito longa."),
});

export type NutritionField = keyof z.input<typeof nutritionSchema>;

export const nutrientAmount = (label: string) => optionalDecimal({ label, max: 999_999_999, scale: 3 });
