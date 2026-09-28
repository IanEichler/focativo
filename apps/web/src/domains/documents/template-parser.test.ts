import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { extractPlaceholders } from "./template-parser";

function buildDocxBuffer(bodyXml: string): Buffer {
  const zip = new PizZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="ns"><w:body>${bodyXml}</w:body></w:document>`,
  );
  return zip.generate({ type: "nodebuffer" });
}

describe("extractPlaceholders", () => {
  it("finds simple placeholders in plain text", () => {
    const buffer = buildDocxBuffer("<w:p><w:r><w:t>Nome: {{nome}}, CPF: {{cpf}}</w:t></w:r></w:p>");
    expect(extractPlaceholders(buffer)).toEqual(["nome", "cpf"]);
  });

  it("reconstructs a placeholder split across separate XML runs (Word spellcheck gotcha)", () => {
    const buffer = buildDocxBuffer("<w:p><w:r><w:t>{{no</w:t></w:r><w:r><w:t>me}}</w:t></w:r></w:p>");
    expect(extractPlaceholders(buffer)).toEqual(["nome"]);
  });

  it("deduplicates a placeholder repeated multiple times", () => {
    const buffer = buildDocxBuffer("<w:p><w:r><w:t>{{nome}} ... assinado por {{nome}}</w:t></w:r></w:p>");
    expect(extractPlaceholders(buffer)).toEqual(["nome"]);
  });

  it("returns an empty array when the docx has no document.xml", () => {
    const zip = new PizZip();
    zip.file("word/other.xml", "<x/>");
    expect(extractPlaceholders(zip.generate({ type: "nodebuffer" }))).toEqual([]);
  });

  it("returns an empty array when there are no placeholders", () => {
    const buffer = buildDocxBuffer("<w:p><w:r><w:t>Sem campos aqui.</w:t></w:r></w:p>");
    expect(extractPlaceholders(buffer)).toEqual([]);
  });
});
