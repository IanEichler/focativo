import "server-only";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { templateDelimiters } from "./template-parser";
import { formatContractFields } from "./field-format";

/**
 * Preenche um modelo .docx com os dados resolvidos (auto-preenchidos +
 * digitados no formulário). `nullGetter` garante que um placeholder sem
 * valor vire string vazia em vez de derrubar a geração inteira.
 */
export function fillTemplate(templateBuffer: Buffer, data: Record<string, string>): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    delimiters: templateDelimiters(templateBuffer),
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render(formatContractFields(data));
  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}
