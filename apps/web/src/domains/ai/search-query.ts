// Sem "server-only": função pura de texto (sem env, sem Node-only APIs),
// usada pelo DevAIProvider e testável diretamente pelo vitest.

// Sem NLU real, uma pergunta inteira ("Oi, vocês têm creatina?") passada
// como busca literal não bate com nada no catálogo — catalog_search_variants
// casa a frase toda como substring. Tira saudações/palavras de preenchimento
// comuns para sobrar só o termo de produto, sem pretender ser um parser real.
const STOPWORDS = new Set([
  "oi",
  "ola",
  "olá",
  "bom",
  "dia",
  "boa",
  "tarde",
  "noite",
  "vc",
  "vcs",
  "voce",
  "você",
  "voces",
  "vocês",
  "tem",
  "tm",
  "têm",
  "tenho",
  "queria",
  "gostaria",
  "quero",
  "preciso",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "com",
  "para",
  "pra",
  "por",
  "favor",
  "algum",
  "alguma",
  "ainda",
  "um",
  "uma",
  "uns",
  "umas",
  "a",
  "o",
  "as",
  "os",
]);

export function extractSearchQuery(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !STOPWORDS.has(word));
  return words.length > 0 ? words.join(" ") : text;
}
