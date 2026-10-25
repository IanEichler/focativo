import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { templateDelimiters } from "./template-parser";
import { formatContractFields } from "./field-format";

/**
 * Preenche um modelo .docx com os dados resolvidos (auto-preenchidos +
 * digitados no formulário). `nullGetter` garante que um placeholder sem
 * valor vire string vazia em vez de derrubar a geração inteira. Sem
 * dependência de Node: a pré-visualização do formulário roda isto no navegador.
 */
export function fillTemplateBytes(
  templateBytes: Uint8Array,
  data: Record<string, string>,
  options: { emptyValue?: string } = {},
): Uint8Array {
  const zip = new PizZip(templateBytes);
  const doc = new Docxtemplater(zip, {
    delimiters: templateDelimiters(templateBytes),
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => options.emptyValue ?? "",
  });
  // Com emptyValue (pré-visualização), campo em branco vira a marca no lugar de sumir.
  const filled =
    options.emptyValue === undefined
      ? data
      : Object.fromEntries(Object.entries(data).filter(([, value]) => value.trim()));
  doc.render(formatContractFields(filled));
  return doc.getZip().generate({ type: "uint8array" });
}
