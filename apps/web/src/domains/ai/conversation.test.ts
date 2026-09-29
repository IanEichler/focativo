import { describe, expect, it } from "vitest";
import {
  ATTENDANT_INSTRUCTIONS,
  buildCalendarContext,
  buildConversationHistory,
  buildSystemPrompt,
  splitIntoMessages,
} from "./conversation";

describe("calendar context", () => {
  it("resolves relative dates using the business timezone, including a month boundary", () => {
    const context = buildCalendarContext(new Date("2026-09-30T01:00:00Z"), "America/Cuiaba");
    expect(context).toContain("Hoje: 2026-09-29");
    expect(context).toContain("Amanhã: 2026-09-30");
    expect(context).toContain("Depois de amanhã: 2026-10-01");
  });
  it("handles a year boundary", () => {
    expect(buildCalendarContext(new Date("2026-12-31T15:00:00Z"), "America/Sao_Paulo")).toContain("Amanhã: 2027-01-01");
  });
});

describe("instructions sent to the model", () => {
  it("keeps the conversation rules when the company has custom instructions", () => {
    const prompt = buildSystemPrompt({
      customInstructions: "Apresente-se como assistente da Clínica Exemplo.",
      businessContext: "Atendemos aos sábados.",
      customerContext: "Cliente: Maria.",
    });
    expect(prompt).toContain(ATTENDANT_INSTRUCTIONS);
    expect(prompt).toContain("Apresente-se como assistente da Clínica Exemplo.");
    expect(prompt).toContain("Atendemos aos sábados.");
    expect(prompt).toContain("Cliente: Maria.");
  });
  it("uses the default instructions when customization is blank", () => {
    const prompt = buildSystemPrompt({ customInstructions: "  " });
    expect(prompt).toContain(ATTENDANT_INSTRUCTIONS);
    expect(prompt).not.toContain("Instruções da empresa:");
    expect(prompt).toContain("ANTES DE RESPONDER");
  });
});

describe("conversation context", () => {
  const row = (direction: string, content: string | null, status = "SENT", media_type: string | null = null) => ({
    direction,
    content,
    status,
    media_type,
  });
  it("keeps consecutive details together without losing the previous answer", () => {
    expect(
      buildConversationHistory([
        row("OUTBOUND", "Qual serviço você procura?"),
        row("INBOUND", "Limpeza de pele"),
        row("INBOUND", "Na sexta"),
        row("INBOUND", "À tarde"),
      ]),
    ).toEqual([
      { role: "assistant", content: [{ type: "text", text: "Qual serviço você procura?" }] },
      { role: "user", content: "Limpeza de pele\nNa sexta\nÀ tarde" },
    ]);
  });
  it("excludes failed and queued responses while preserving delivered and read responses", () => {
    const history = buildConversationHistory([
      row("INBOUND", "Qual o valor?"),
      row("OUTBOUND", "Não chegou", "FAILED"),
      row("OUTBOUND", "Ainda não saiu", "QUEUED"),
      row("OUTBOUND", "O valor é R$ 150.", "DELIVERED"),
      row("OUTBOUND", "A sessão dura uma hora.", "READ"),
    ]);
    expect(history).toEqual([
      { role: "user", content: "Qual o valor?" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "O valor é R$ 150." },
          { type: "text", text: "A sessão dura uma hora." },
        ],
      },
    ]);
  });
  it("represents an attachment without pretending its contents are readable", () => {
    const history = buildConversationHistory([row("INBOUND", null, "SENT", "ptt")]);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      role: "user",
      content: expect.stringContaining("conteúdo não está disponível"),
    });
  });
  it("keeps attachment captions and ignores empty events", () => {
    expect(
      buildConversationHistory([
        row("INBOUND", "  "),
        row("INBOUND", "Minha dúvida é sobre este serviço", "SENT", "image"),
      ]),
    ).toEqual([{ role: "user", content: "Minha dúvida é sobre este serviço" }]);
  });
});

describe("WhatsApp replies", () => {
  it("converts bold formatting to WhatsApp syntax", () => {
    expect(splitIntoMessages("O valor é **R$ 150**.")).toEqual(["O valor é *R$ 150*."]);
  });
  it("separates ideas and keeps a greeting with the first useful message", () => {
    expect(splitIntoMessages("Olá!\r\n\r\nSobre o serviço.\n\nSobre o valor.\n\nQual dia prefere?")).toEqual([
      "Olá! Sobre o serviço.",
      "Sobre o valor.",
      "Qual dia prefere?",
    ]);
  });
  it("splits long single paragraphs at sentence boundaries without changing prices or links", () => {
    const sentences = [
      "O pacote custa R$ 1.245,00 e inclui cinco sessões do procedimento, conforme as condições que consultamos no cadastro da clínica.",
      "Cada sessão dura 40 minutos; a profissional confirma os cuidados específicos durante a avaliação e pode tirar suas dúvidas sobre o procedimento.",
      "Você encontra os detalhes em https://clinica.example/pacotes. Qual período costuma ser melhor para você?",
    ];
    const chunks = splitIntoMessages(sentences.join(" "));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ")).toBe(sentences.join(" "));
    expect(chunks.every((chunk) => chunk.length <= 280)).toBe(true);
    expect(chunks.some((chunk) => chunk.includes("R$ 1.245,00"))).toBe(true);
    expect(chunks.some((chunk) => chunk.includes("https://clinica.example/pacotes"))).toBe(true);
  });
  it("preserves long answers while limiting the number of notifications", () => {
    const paragraphs = Array.from({ length: 9 }, (_, i) => `Informação ${i}: ${"detalhe ".repeat(15).trim()}.`);
    const chunks = splitIntoMessages(paragraphs.join("\n\n"));
    expect(chunks).toHaveLength(4);
    expect(chunks.join("\n\n")).toBe(paragraphs.join("\n\n"));
  });
  it("keeps a currency amount together at a long-sentence boundary", () => {
    const text = `${"detalhe ".repeat(34)}valor R$ 1.245,00 ${"condição ".repeat(20)}`.trim();
    const chunks = splitIntoMessages(text);
    expect(chunks.some((chunk) => chunk.includes("R$ 1.245,00"))).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });
  it("does not send blank messages", () => {
    expect(splitIntoMessages(" \n\n ")).toEqual([]);
  });
});
