import PizZip from "pizzip";
import { expect, it } from "vitest";
import { fillTemplateBytes } from "./fill-template-core";

function template(fields: string[]): Uint8Array {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${fields.map((field) => `<w:p><w:r><w:t>{${field}}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  return zip.generate({ type: "uint8array" });
}

it("marks blank fields in the live preview without formatting the mark", () => {
  const output = fillTemplateBytes(template(["cliente_nome", "valor_final", "data_contratacao"]), {
    cliente_nome: "Maria",
    valor_final: "  ",
    data_contratacao: "",
  }, { emptyValue: "____" });
  const xml = new PizZip(output).file("word/document.xml")!.asText();
  expect(xml).toContain("Maria");
  expect(xml.match(/____/g)).toHaveLength(2);
});

it("keeps blank fields empty in the generated contract", () => {
  const output = fillTemplateBytes(template(["cliente_nome", "valor_final"]), { cliente_nome: "Maria", valor_final: "" });
  const xml = new PizZip(output).file("word/document.xml")!.asText();
  expect(xml).not.toContain("____");
});
