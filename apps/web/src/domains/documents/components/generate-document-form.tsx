"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { TextField } from "@/components/forms/text-field";
import { TextareaField } from "@/components/forms/fields";
import { MaskedTextField } from "@/components/forms/masked-text-field";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerPicker } from "@/domains/customers/components/customer-picker";
import { CustomerAddressFields } from "@/domains/customers/components/customer-address-fields";
import type { CustomerOption } from "@/domains/customers/queries";
import { generateDocumentAction, previewDocumentFieldsAction, type FieldPreview } from "../actions";
import { GENERATE_IDLE, type GenerateDocumentState } from "../state";
import type { DocumentTemplateRow } from "../queries";
import { contractDateInWords, contractFieldKind, contractFieldMask, normalizeFieldName } from "../field-format";
import { ContractValueField } from "./contract-value-field";
import { ContractPaymentField } from "./contract-payment-field";
import { SignatureControls } from "@/domains/signatures/components/signature-controls";

export function GenerateDocumentForm({
  template,
  initialCustomer,
}: {
  template: DocumentTemplateRow;
  initialCustomer: CustomerOption | null;
}) {
  const [customer, setCustomer] = useState<CustomerOption | null>(initialCustomer);
  const [preview, setPreview] = useState<FieldPreview | null>(null);
  const [loadingPreview, startPreviewTransition] = useTransition();
  const submitting = useRef(false);
  const [state, formAction, generating] = useActionState<GenerateDocumentState, FormData>(async (previous, data) => {
    try {
      return await generateDocumentAction(previous, data);
    } catch {
      return { status: "error", message: "Não foi possível gerar o contrato. Seus dados foram mantidos; tente novamente." };
    } finally {
      submitting.current = false;
    }
  }, GENERATE_IDLE);

  function loadPreview(customerId: string) {
    startPreviewTransition(async () => {
      const result = await previewDocumentFieldsAction(template.id, customerId);
      setPreview("error" in result ? null : result);
    });
  }

  function handleCustomerChange(option: CustomerOption) {
    if (submitting.current) return;
    setCustomer(option);
    setPreview(null);
    loadPreview(option.id);
  }

  useEffect(() => {
    // Só a primeira carga (cliente pré-selecionado ao abrir a página) — trocas
    // depois disso disparam pelo handler do CustomerPicker, num evento real,
    // não sincronamente dentro do efeito.
    if (initialCustomer) loadPreview(initialCustomer.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Contrato gerado em PDF e Word.");
      if (state.profileWarning) toast.warning(state.profileMessage);
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preencher contrato</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          aria-busy={generating}
          onSubmit={(event) => {
            event.preventDefault();
            if (submitting.current || generating || loadingPreview || !customer || !preview) return;
            // Dispatch explicitly so React does not reset uncontrolled fields after the action settles.
            const data = new FormData(event.currentTarget);
            submitting.current = true;
            startTransition(() => formAction(data));
          }}
        >
          <fieldset disabled={generating} className="flex min-w-0 flex-col gap-4">
          <input type="hidden" name="templateId" value={template.id} />
          {customer && <input type="hidden" name="customerId" value={customer.id} />}

          <CustomerPicker value={customer} onChange={handleCustomerChange} />

          {loadingPreview && <p className="text-small text-muted-foreground">Carregando campos do modelo…</p>}

          {preview && <ContractFields key={customer?.id} fields={preview.remaining} autoFilled={preview.autoFilled} />}

          {customer && preview && preview.remaining.length === 0 && Object.keys(preview.autoFilled).length === 0 && (
            <p className="text-small text-muted-foreground">Esse modelo não tem campos de preenchimento.</p>
          )}

          <label className="flex items-center gap-2 text-body">
            <input type="checkbox" name="saveToProfile" value="true" defaultChecked className="size-4" />
            Salvar o arquivo do contrato no perfil do cliente
          </label>
          <p className="text-small text-muted-foreground">
            Ao gerar, os dados pessoais preenchidos completam os campos vazios do perfil da cliente. Informações já
            cadastradas são preservadas, mesmo se você alterar o valor neste contrato.
          </p>

          </fieldset>

          <Button type="submit" disabled={!customer || !preview || loadingPreview || generating} aria-busy={generating} className="self-start">
            {generating && <Spinner />}
            {generating ? "Gerando PDF e Word…" : "Gerar PDF e Word"}
          </Button>
          {state.status === "error" && <p role="alert" className="text-small text-danger">{state.message}</p>}

          {state.status === "success" && (
            <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/40 p-3">
              {state.profileMessage && (
                <p role={state.profileWarning ? "alert" : "status"} className="w-full text-small">
                  {state.profileMessage}
                </p>
              )}
              {state.signatureWarning && <p role="alert" className="w-full text-small text-warning">{state.signatureWarning}</p>}
              <Button
                type="button"
                onClick={() =>
                  downloadBase64File(state.pdfBase64, state.fileName.replace(/\.docx$/i, ".pdf"), "application/pdf")
                }
              >
                Baixar PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => downloadBase64File(state.docxBase64, state.fileName, DOCX_MIME_TYPE)}
              >
                Baixar Word (.docx)
              </Button>
              {state.signatureDocumentId ? <SignatureControls key={state.signatureDocumentId} documentId={state.signatureDocumentId} initialUrl={state.signatureUrl} /> : !state.signatureWarning && <p className="w-full text-small text-muted-foreground">Para solicitar assinatura, marque “Salvar o arquivo do contrato no perfil” e gere o contrato.</p>}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function downloadBase64File(base64: string, fileName: string, contentType: string): void {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const FIELD_LABELS: Record<string, string> = {
  cliente_nome: "Nome da cliente",
  cliente_cpf: "CPF da cliente",
  cliente_data_nascimento: "Data de nascimento",
  cliente_telefone: "Telefone da cliente",
  cliente_email: "E-mail da cliente",
  cliente_rg: "RG",
  cliente_profissao: "Profissão",
  cliente_endereco: "Endereço",
  cliente_cidade_uf: "Cidade / UF",
  cliente_cep: "CEP",
  pacote_nome: "Nome do pacote",
  antecedencia_cancelamento_horas: "Antecedência para cancelar (horas)",
  tolerancia_atraso_minutos: "Tolerância para atraso (minutos)",
  validade_pacote_meses: "Validade do pacote (meses)",
  forma_pagamento: "Forma de pagamento",
  valor_bruto: "Valor bruto",
  desconto: "Desconto",
  valor_final: "Valor final",
  numero_parcelas: "Número de parcelas",
  valor_parcela: "Valor da parcela",
  vencimento: "Vencimento",
  data_contratacao: "Data da contratação",
  data_assinatura: "Data da assinatura",
  data_assinatura_extenso: "Data da assinatura por extenso",
};

const PROCEDURE_FIELD_LABELS: Record<string, string> = {
  procedimento: "Nome do procedimento",
  regiao: "Região tratada",
  sessoes: "Quantidade de sessões",
  valor_sessao: "Valor por sessão",
  valor_total: "Valor total do procedimento",
};

const SESSION_FIELD_LABELS: Record<string, string> = {
  data: "Data da sessão",
  procedimento: "Procedimento realizado",
  regiao: "Região tratada",
  numero: "Número da sessão",
  observacoes: "Observações da sessão",
};

function fieldLabel(field: string): string {
  const item = /^item_(\d+)_(.+)$/.exec(field);
  if (item) return PROCEDURE_FIELD_LABELS[item[2]!] ?? item[2]!.replaceAll("_", " ");
  const session = /^sessao_(\d+)_(.+)$/.exec(field);
  if (session) return SESSION_FIELD_LABELS[session[2]!] ?? session[2]!.replaceAll("_", " ");
  return FIELD_LABELS[field] ?? field.replaceAll("_", " ");
}

export function ContractFields({ fields: remainingFields, autoFilled }: { fields: string[]; autoFilled: Record<string, string> }) {
  const signatureField = [...Object.keys(autoFilled), ...remainingFields].find((field) => normalizeFieldName(field) === "data_assinatura");
  const [signatureDate, setSignatureDate] = useState(signatureField ? autoFilled[signatureField] ?? "" : "");
  const addressFields = [...new Set([...Object.keys(autoFilled), ...remainingFields])].filter((field) =>
    ["postal_code", "address", "city_state"].includes(contractFieldKind(field) ?? ""),
  );
  const fields = remainingFields.filter((field) => !addressFields.includes(field));
  const autoFields = Object.keys(autoFilled).filter((field) => !addressFields.includes(field) && !/^(item|sessao)_\d+_/.test(field));
  const procedureFields = [...new Set([...Object.keys(autoFilled), ...remainingFields])].filter((field) => /^item_\d+_/.test(field));
  const procedureNumbers = [...new Set(procedureFields.map((field) => /^item_(\d+)_/.exec(field)![1]!))]
    .sort((a, b) => Number(a) - Number(b));
  const procedureOrder = Object.keys(PROCEDURE_FIELD_LABELS);
  const procedureGroups = procedureNumbers.map((number) => ({
    title: `Procedimento ${number}`,
    fields: procedureFields.filter((field) => field.startsWith(`item_${number}_`)).sort((a, b) => {
      const order = (field: string) => {
        const index = procedureOrder.indexOf(field.replace(/^item_\d+_/, ""));
        return index < 0 ? procedureOrder.length : index;
      };
      return order(a) - order(b);
    }),
  }));
  const sessionFields = [...new Set([...Object.keys(autoFilled), ...remainingFields])]
    .filter((field) => /^sessao_\d+_/.test(field) && !field.endsWith("_assinatura"));
  const sessionNumbers = [...new Set(sessionFields.map((field) => /^sessao_(\d+)_/.exec(field)![1]!))]
    .sort((a, b) => Number(a) - Number(b));
  const sessionOrder = Object.keys(SESSION_FIELD_LABELS);
  const sessionGroups = sessionNumbers.map((number) => ({
    title: `Sessão ${number} (opcional)`,
    optional: true,
    fields: sessionFields.filter((field) => field.startsWith(`sessao_${number}_`)).sort((a, b) => {
      const order = (field: string) => {
        const index = sessionOrder.indexOf(field.replace(/^sessao_\d+_/, ""));
        return index < 0 ? sessionOrder.length : index;
      };
      return order(a) - order(b);
    }),
  }));
  const addressNames = {
    postal_code: addressFields.filter((field) => contractFieldKind(field) === "postal_code"),
    address: addressFields.filter((field) => contractFieldKind(field) === "address"),
    city_state: addressFields.filter((field) => contractFieldKind(field) === "city_state"),
  };
  const initialAddressValue = (names: string[]) => names.map((name) => autoFilled[name]).find((value) => value?.trim());
  const groups: { title: string; fields: string[]; optional?: boolean }[] = [
    { title: "Dados puxados do cadastro (você pode corrigir)", fields: autoFields },
    { title: "Dados complementares da cliente", fields: fields.filter((field) => field.startsWith("cliente_")) },
    { title: "Endereço da cliente", fields: addressFields },
    {
      title: "Pacote e condições",
      fields: fields.filter((field) =>
        [
          "pacote_nome",
          "antecedencia_cancelamento_horas",
          "tolerancia_atraso_minutos",
          "validade_pacote_meses",
        ].includes(field),
      ),
    },
    ...procedureGroups,
    { title: "Resumo dos valores", fields: fields.filter((field) => ["valor_bruto", "desconto", "valor_final"].includes(field)) },
    {
      title: "Pagamento e datas",
      fields: fields.filter((field) =>
        [
          "forma_pagamento",
          "numero_parcelas",
          "valor_parcela",
          "vencimento",
          "data_contratacao",
          "data_assinatura",
          "data_assinatura_extenso",
        ].includes(field),
      ),
    },
    ...sessionGroups,
  ];
  const used = new Set(groups.flatMap((group) => group.fields));
  const other = fields.filter(
    (field) => !used.has(field) && !field.startsWith("assinatura_") && !field.endsWith("_assinatura"),
  );
  if (other.length) groups.push({ title: "Outros campos do modelo", fields: other });

  return (
    <div className="flex flex-col gap-5">
      {groups
        .filter((group) => group.fields.length > 0)
        .map((group) => {
          const inputs = group.title === "Endereço da cliente" ? (
            <div className="flex flex-col gap-4 pt-3">
              <CustomerAddressFields
                initialValues={{
                  postal_code: initialAddressValue(addressNames.postal_code),
                  address: initialAddressValue(addressNames.address),
                  city_state: initialAddressValue(addressNames.city_state),
                }}
                errors={{}}
                names={{
                  postal_code: addressNames.postal_code.map((field) => `field_${field}`),
                  address: addressNames.address.map((field) => `field_${field}`),
                  city_state: addressNames.city_state.map((field) => `field_${field}`),
                }}
              />
            </div>
          ) : (
            <div className="grid gap-4 pt-3 sm:grid-cols-2">
              {group.fields.map((field) => {
                const mask = contractFieldMask(field);
                const props = { label: fieldLabel(field), name: `field_${field}`, defaultValue: autoFilled[field] };
                const kind = contractFieldKind(field);
                if (/^sessao_\d+_observacoes$/.test(field)) {
                  return <div key={field} className="sm:col-span-2"><TextareaField {...props} rows={3} maxLength={2000} /></div>;
                }
                if (normalizeFieldName(field) === "forma_pagamento") {
                  return <ContractPaymentField key={field} name={`field_${field}`} defaultValue={autoFilled[field]} />;
                }
                if (["date", "money", "integer"].includes(kind ?? "")) {
                  return <ContractValueField key={field} field={field} label={fieldLabel(field)} defaultValue={autoFilled[field]}
                    onValueChange={field === signatureField ? setSignatureDate : undefined} />;
                }
                if (signatureField && normalizeFieldName(field) === "data_assinatura_extenso") {
                  return <TextField key={field} label={fieldLabel(field)} name={`field_${field}`}
                    value={contractDateInWords(signatureDate)} readOnly placeholder="Preencha a data da assinatura"
                    description="Preenchida automaticamente a partir da data da assinatura." />;
                }
                return mask ? (
                  <MaskedTextField key={field} {...props} mask={mask} inputMode={contractFieldKind(field) === "phone" ? "tel" : "numeric"} />
                ) : <TextField key={field} {...props} />;
              })}
            </div>
          );
          return group.optional ? (
            <details key={group.title} className="rounded-lg border border-border p-4">
              <summary className="cursor-pointer font-medium">{group.title}</summary>
              {inputs}
            </details>
          ) : (
            <fieldset key={group.title} className="rounded-lg border border-border p-4">
              <legend className="px-1 font-medium">{group.title}</legend>
              {inputs}
            </fieldset>
          );
        })}
      {fields.some((field) => field.startsWith("assinatura_") || field.endsWith("_assinatura")) && (
        <p className="text-small text-muted-foreground">
          Os espaços de assinatura ficam em branco para assinatura após a revisão do contrato.
        </p>
      )}
    </div>
  );
}
