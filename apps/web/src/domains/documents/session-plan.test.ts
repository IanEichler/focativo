import { expect, it } from "vitest";
import { contractSessionInputs } from "./session-plan";
const serviceId = "11111111-1111-4111-8111-111111111111", professionalId = "22222222-2222-4222-8222-222222222222";
function data(number = 1) {
  const form = new FormData();
  form.set(`session_${number}_time`, "14:30"); form.set(`session_${number}_serviceId`, serviceId); form.set(`session_${number}_professionalId`, professionalId);
  return form;
}
it("ignores undated optional sessions even when other session details are filled", () => {
  expect(contractSessionInputs({ sessao_1_data: "", sessao_2_data: "____/____/______", sessao_1_procedimento: "Teste", data_assinatura: "30/09/2026" }, data())).toEqual([]);
});
it("keeps only dated sessions and normalizes Brazilian dates without using the browser timezone", () => {
  expect(contractSessionInputs({ sessao_1_data: "30/09/2026", sessao_1_regiao: "Braço", sessao_1_observacoes: "Primeira sessão", sessao_2_data: "" }, data())).toEqual([
    { number: 1, date: "2026-09-30", time: "14:30", serviceId, professionalId, notes: "Braço · Primeira sessão" },
  ]);
});
it.each(["time", "serviceId", "professionalId"])("requires %s for every dated session", field => {
  const form = data(); form.delete(`session_1_${field}`);
  expect(() => contractSessionInputs({ sessao_1_data: "30/09/2026" }, form)).toThrow("Sessão 1");
});
it("rejects malformed times and invalid dates", () => {
  const form = data(); form.set("session_1_time", "25:90");
  expect(() => contractSessionInputs({ sessao_1_data: "30/09/2026" }, form)).toThrow();
  expect(() => contractSessionInputs({ sessao_1_data: "31/02/2026" }, data())).toThrow("data");
});
