import PizZip from "pizzip";

const PLACEHOLDER_PATTERN = /\{\{\s*([\w.]+)\s*\}\}|\{\s*([\w.]+)\s*\}/g;

/**
 * Descobre os placeholders "{campo}" ou "{{campo}}" usados num .docx, sem depender de
 * nenhum módulo pago de inspeção do docxtemplater. O Word costuma partir um
 * mesmo placeholder em várias "runs" de XML (ex.: revisão ortográfica separa
 * "{{na" de "me}}") — por isso removemos as tags XML primeiro (mantendo só o
 * texto visível concatenado) em vez de tentar casar o regex direto no XML
 * cru, senão placeholders partidos passariam batido.
 */
export function extractPlaceholders(fileBuffer: Buffer): string[] {
  const zip = new PizZip(fileBuffer);
  const documentXml = zip.file("word/document.xml")?.asText();
  if (!documentXml) return [];

  const plainText = documentXml.replace(/<[^>]+>/g, "");
  const found = new Set<string>();
  for (const match of plainText.matchAll(PLACEHOLDER_PATTERN)) {
    found.add((match[1] ?? match[2])!);
  }
  return [...found];
}

/** Mantém compatibilidade com modelos antigos de chaves duplas e com DOCX do Word de chaves simples. */
export function templateDelimiters(fileBuffer: Buffer): { start: string; end: string } {
  const xml = new PizZip(fileBuffer).file("word/document.xml")?.asText() ?? "";
  const text = xml.replace(/<[^>]+>/g, "");
  return /\{\{\s*[\w.]+\s*\}\}/.test(text) ? { start: "{{", end: "}}" } : { start: "{", end: "}" };
}
