import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), convert: vi.fn(), fill: vi.fn(), revalidate: vi.fn(), snapshot: vi.fn(), link: vi.fn(), ready: vi.fn(), signature: vi.fn(), document: vi.fn(), signedDownload: vi.fn(), signedUrl: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/domains/tenants/context", () => ({
  requireTenantContext: async () => ({
    tenant: { id: "tenant" },
    user: { id: "user" },
    can: () => true,
    hasModule: () => true,
  }),
}));
vi.mock("@/domains/customers/queries", () => ({
  getCustomerDetail: async () => ({
    name: "Nome original",
    email: "original@example.com",
    phone: null,
    whatsapp: null,
    document: null,
    birthday: null,
  }),
}));
vi.mock("./queries", () => ({
  getDocumentTemplate: async () => ({
    name: "Contrato",
    filePath: "template.docx",
    fields: ["cliente_nome", "cliente_email", "cliente_cpf", "cliente_rg", "data_contratacao", "valor_parcela", "numero_parcelas", "sessao_1_data", "sessao_1_procedimento"],
  }),
  getTenantFieldsForDocument: async () => ({ name: "Clínica" }),
}));
vi.mock("./fill-template", () => ({ fillTemplate: mock.fill }));
vi.mock("./convert-to-pdf", () => ({ convertDocxToPdf: mock.convert }));
vi.mock("@/domains/signatures/snapshot", () => ({ saveSigningSnapshot: mock.snapshot }));
vi.mock("@/domains/signatures/actions", () => ({ createSignatureLinkAction: mock.link, downloadSignedContractAction: mock.signedDownload }));
vi.mock("@/domains/signatures/security", () => ({ signingReadiness: mock.ready }));
vi.mock("@/domains/signatures/client", () => ({ signingClient: () => ({
  from: () => { const q = { select: () => q, eq: () => q, maybeSingle: mock.signature }; return q; },
}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mock.rpc,
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: mock.document }; return q; },
    storage: { from: () => ({ createSignedUrl: mock.signedUrl, download: async () => ({ data: new Blob(["template"]), error: null }), upload: async () => ({ error: null }) }) },
  }),
}));
import { getCustomerDocumentPdfAction, getCustomerDocumentDownloadUrlAction, generateDocumentAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mock.document.mockResolvedValue({ data: { name: "Contract.docx", file_path: "contract.docx" }, error: null });
  mock.signature.mockResolvedValue({ data: { status: "SIGNED" }, error: null });
  mock.signedDownload.mockResolvedValue({ status: "success", base64: "immutable-bytes", name: "Contract-assinado.pdf" });
  mock.rpc.mockResolvedValue({ data: 2, error: null });
  mock.fill.mockReturnValue(Buffer.from("docx"));
  mock.convert.mockResolvedValue(Buffer.from("pdf"));
  mock.snapshot.mockResolvedValue(undefined);
  mock.ready.mockReturnValue(null);
  mock.link.mockResolvedValue({ status: "success", url: "https://sign.example.test/assinar/test" });
});
function form() {
  const data = new FormData();
  data.set("templateId", "11111111-1111-4111-8111-111111111111");
  data.set("customerId", "22222222-2222-4222-8222-222222222222");
  data.set("field_cliente_nome", "Nome no contrato");
  data.set("field_cliente_email", "contrato@example.com");
  data.set("field_cliente_cpf", "123.456.789-00");
  data.set("field_cliente_rg", "RG123");
  data.set("field_tenant_id", "injected");
  return data;
}
it("syncs corrected and missing personal data even when saving the contract file is unchecked", async () => {
  const result = await generateDocumentAction({ status: "idle" }, form());
  expect(result.status).toBe("success");
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("customer_sync_from_contract", {
    p_customer_id: "22222222-2222-4222-8222-222222222222",
    p_values: { name: "Nome no contrato", email: "contrato@example.com", document: "12345678900", rg: "RG123" },
    p_expected: { name: "Nome original", email: "original@example.com", document: null, rg: null },
  });
  expect(mock.fill).toHaveBeenCalledWith(
    expect.any(Buffer),
    expect.objectContaining({ cliente_nome: "Nome no contrato", cliente_email: "contrato@example.com" }),
  );
  expect(mock.revalidate).toHaveBeenCalledWith("/app/clientes/22222222-2222-4222-8222-222222222222");
});

it("explains concurrent profile edits without discarding the generated contract", async () => {
  mock.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "customer_changed" } });
  expect(await generateDocumentAction({ status: "idle" }, form())).toMatchObject({ status: "success", profileWarning: true, profileMessage: expect.stringContaining("perfil foi alterado durante a geração") });
});
it("does not change the profile if PDF generation fails", async () => {
  mock.convert.mockRejectedValue(new Error("conversion failed"));
  expect((await generateDocumentAction({ status: "idle" }, form())).status).toBe("error");
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("rejects invalid contract dates and fractional installments before rendering or saving", async () => {
  for (const [field, value] of [["data_contratacao", "31/02/2026"], ["numero_parcelas", "1.5"]]) {
    const data = form();
    data.set(`field_${field}`, value!);
    expect((await generateDocumentAction({ status: "idle" }, data)).status).toBe("error");
  }
  expect(mock.fill).not.toHaveBeenCalled();
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("keeps generated downloads available and warns if the profile could not be saved", async () => {
  mock.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "unique_violation" } });
  const result = await generateDocumentAction({ status: "idle" }, form());
  expect(result).toMatchObject({
    status: "success",
    profileWarning: true,
    docxBase64: expect.any(String),
    pdfBase64: expect.any(String),
  });
});
it("creates the signing link automatically from the saved PDF and retains downloads if link creation fails", async () => {
  mock.rpc.mockImplementation(async name => ({ data: name === "customer_document_create" ? "33333333-3333-4333-8333-333333333333" : 2, error: null }));
  const data = form(); data.set("saveToProfile", "true");
  const result = await generateDocumentAction({ status: "idle" }, data);
  expect(result).toMatchObject({ status: "success", signatureDocumentId: "33333333-3333-4333-8333-333333333333", signatureUrl: "https://sign.example.test/assinar/test" });
  expect(mock.snapshot).toHaveBeenCalledWith(expect.any(Object), expect.any(String), expect.any(String), expect.any(String), Buffer.from("pdf"), expect.objectContaining({ cliente_nome: "Nome no contrato" }), expect.any(Object), []);
  mock.link.mockResolvedValue({ status: "error", message: "Link temporariamente indisponível" });
  expect(await generateDocumentAction({ status: "idle" }, data)).toMatchObject({ status: "success", pdfBase64: expect.any(String), signatureWarning: "Link temporariamente indisponível" });
});

it("serves the original signed PDF through the legacy download action and disables Word", async () => {
  expect(await getCustomerDocumentPdfAction("document")).toEqual({ status: "success", fileBase64: "immutable-bytes", fileName: "Contract-assinado.pdf" });
  expect(await getCustomerDocumentDownloadUrlAction("document")).toBeNull();
  expect(mock.convert).not.toHaveBeenCalled();
  expect(mock.signedUrl).not.toHaveBeenCalled();
});
it("fails closed when signature status is unavailable or signed storage fails", async () => {
  mock.signature.mockResolvedValue({ data: null, error: {} });
  expect(await getCustomerDocumentPdfAction("document")).toEqual({ status: "error" });
  expect(await getCustomerDocumentDownloadUrlAction("document")).toBeNull();
  mock.signature.mockResolvedValue({ data: { status: "SIGNED" }, error: null });
  mock.signedDownload.mockResolvedValue({ status: "error", message: "unavailable" });
  expect(await getCustomerDocumentPdfAction("document")).toEqual({ status: "error" });
  expect(mock.convert).not.toHaveBeenCalled();
  expect(mock.signedUrl).not.toHaveBeenCalled();
});
it("checks access to the customer document before looking up a privileged signature", async () => {
  mock.document.mockResolvedValue({ data: null, error: null });
  expect(await getCustomerDocumentPdfAction("other-tenant")).toEqual({ status: "error" });
  expect(await getCustomerDocumentDownloadUrlAction("other-tenant")).toBeNull();
  expect(mock.signature).not.toHaveBeenCalled();
});

it("validates dated sessions before rendering and stores their immutable agenda plan with the signature", async () => {
  const data = form(); data.set("saveToProfile", "true"); data.set("field_sessao_1_data", "01/01/2100");
  data.set("session_1_time", "14:00"); data.set("session_1_serviceId", "11111111-1111-4111-8111-111111111111"); data.set("session_1_professionalId", "22222222-2222-4222-8222-222222222222");
  const plan = [{ number: 1, serviceName: "Serviço da agenda", startsAt: "2100-01-01T18:00:00Z" }];
  mock.rpc.mockImplementation(async name => ({ data: name === "contract_validate_sessions" ? plan : name === "customer_document_create" ? "33333333-3333-4333-8333-333333333333" : 2, error: null }));
  expect((await generateDocumentAction({ status: "idle" }, data)).status).toBe("success");
  expect(mock.fill).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ sessao_1_procedimento: "Serviço da agenda" }));
  expect(mock.snapshot.mock.calls[0]![7]).toEqual(plan);
  expect(mock.rpc).not.toHaveBeenCalledWith("agenda_appointment_create", expect.anything());
});
it("does not render or save an invalid session or an occupied slot", async () => {
  const data = form(); data.set("saveToProfile", "true"); data.set("field_sessao_1_data", "01/01/2100");
  expect(await generateDocumentAction({ status: "idle" }, data)).toMatchObject({ status: "error", message: expect.stringContaining("Sessão 1") });
  data.set("session_1_time", "14:00"); data.set("session_1_serviceId", "11111111-1111-4111-8111-111111111111"); data.set("session_1_professionalId", "22222222-2222-4222-8222-222222222222");
  mock.rpc.mockResolvedValue({ error: { message: "slot_unavailable" } });
  expect(await generateDocumentAction({ status: "idle" }, data)).toMatchObject({ status: "error", message: expect.stringContaining("ocupado") });
  expect(mock.fill).not.toHaveBeenCalled(); expect(mock.snapshot).not.toHaveBeenCalled();
});
