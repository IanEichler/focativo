import PizZip from "pizzip";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fillTemplate } from "./fill-template";

it("formats personal fields in the generated Word used by the PDF converter", () => {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const fields = {
    cliente_cpf: "06016940151",
    empresa_cnpj: "11222333000144",
    cliente_telefone: "556692124334",
    cliente_cep: "78716030",
    valor_final: "1234,56",
    valor_parcela: "3123",
    cliente_data_nascimento: "08042004",
    data_contratacao: "08032004",
    data_assinatura: "2026-09-29",
    data_assinatura_extenso: "texto antigo",
    assinatura_cliente: "____________",
  };
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${Object.keys(fields).map((field) => `<w:p><w:r><w:t>{${field}}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  const output = fillTemplate(zip.generate({ type: "nodebuffer" }), fields);
  const xml = new PizZip(output).file("word/document.xml")!.asText();
  for (const value of ["060.169.401-51", "11.222.333/0001-44", "+55 (66) 9212-4334", "78716-030", "1.234,56", "3.123,00", "08/04/2004", "08/03/2004", "29/09/2026", "29 de setembro de 2026", "____________"]) {
    expect(xml).toContain(value);
  }
});
