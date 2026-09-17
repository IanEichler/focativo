import type { StatusTone } from "@/components/data/status-badge";
import type { Enums } from "@/types/database.types";

export const PRODUCT_UNITS = [
  { value: "UN", label: "Unidade (UN)" },
  { value: "KG", label: "Quilograma (KG)" },
  { value: "G", label: "Grama (G)" },
  { value: "L", label: "Litro (L)" },
  { value: "ML", label: "Mililitro (ML)" },
  { value: "CX", label: "Caixa (CX)" },
  { value: "PCT", label: "Pacote (PCT)" },
  { value: "PAR", label: "Par (PAR)" },
  { value: "M", label: "Metro (M)" },
] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number]["value"];

export const INFO_SOURCES: { value: Enums<"info_source">; label: string }[] = [
  { value: "LABEL", label: "Rótulo" },
  { value: "MANUFACTURER", label: "Fabricante" },
  { value: "TECHNICAL_SHEET", label: "Ficha técnica" },
  { value: "MANUAL", label: "Cadastro manual" },
];

export const INFO_SOURCE_LABEL = Object.fromEntries(INFO_SOURCES.map((item) => [item.value, item.label])) as Record<
  Enums<"info_source">,
  string
>;

export const PRESENCE_OPTIONS: { value: Enums<"tri_state">; label: string }[] = [
  { value: "TRUE", label: "Contém" },
  { value: "FALSE", label: "Não contém" },
  { value: "UNKNOWN", label: "Não informado" },
];

export const ATTRIBUTE_TYPES: { value: Enums<"attribute_data_type">; label: string; description: string }[] = [
  { value: "BOOLEAN", label: "Sim / Não", description: "Ex.: vegano, sem açúcar" },
  { value: "NUMBER", label: "Número", description: "Ex.: peso líquido em gramas" },
  { value: "TEXT", label: "Texto", description: "Ex.: linha do produto" },
  { value: "ENUM", label: "Lista de opções", description: "Ex.: sabor" },
];

export const ATTRIBUTE_TYPE_LABEL = Object.fromEntries(ATTRIBUTE_TYPES.map((item) => [item.value, item.label])) as Record<
  Enums<"attribute_data_type">,
  string
>;

export type StockStatus = "OK" | "LOW" | "OUT";

export const STOCK_STATUS: Record<StockStatus, { label: string; tone: StatusTone }> = {
  OK: { label: "Disponível", tone: "success" },
  LOW: { label: "Estoque baixo", tone: "warning" },
  OUT: { label: "Sem estoque", tone: "danger" },
};

export function isStockStatus(value: unknown): value is StockStatus {
  return value === "OK" || value === "LOW" || value === "OUT";
}
