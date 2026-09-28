"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/forms/form-feedback";
import { TextField } from "@/components/forms/text-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerPicker } from "@/domains/customers/components/customer-picker";
import type { CustomerOption } from "@/domains/customers/queries";
import {
  GENERATE_IDLE,
  generateDocumentAction,
  previewDocumentFieldsAction,
  type FieldPreview,
  type GenerateDocumentState,
} from "../actions";
import type { DocumentTemplateRow } from "../queries";

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
  const [state, formAction] = useActionState<GenerateDocumentState, FormData>(generateDocumentAction, GENERATE_IDLE);

  function loadPreview(customerId: string) {
    startPreviewTransition(async () => {
      const result = await previewDocumentFieldsAction(template.id, customerId);
      setPreview("error" in result ? null : result);
    });
  }

  function handleCustomerChange(option: CustomerOption) {
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
      downloadBase64File(state.fileBase64, state.fileName);
      toast.success("Documento gerado.");
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do documento</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="templateId" value={template.id} />
          {customer && <input type="hidden" name="customerId" value={customer.id} />}

          <CustomerPicker value={customer} onChange={handleCustomerChange} />

          {loadingPreview && <p className="text-small text-muted-foreground">Carregando campos do modelo…</p>}

          {preview && Object.keys(preview.autoFilled).length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-small">
              <p className="mb-1 font-medium text-foreground">Preenchidos automaticamente</p>
              <ul className="flex flex-col gap-0.5 text-muted-foreground">
                {Object.entries(preview.autoFilled).map(([field, value]) => (
                  <li key={field}>
                    {field}: {value}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview?.remaining.map((field) => (
            <TextField key={field} label={field} name={`field_${field}`} />
          ))}

          {customer && preview && preview.remaining.length === 0 && Object.keys(preview.autoFilled).length === 0 && (
            <p className="text-small text-muted-foreground">Esse modelo não tem nenhum campo {"{{...}}"}.</p>
          )}

          <label className="flex items-center gap-2 text-body">
            <input type="checkbox" name="saveToProfile" value="true" defaultChecked className="size-4" />
            Salvar no perfil do cliente
          </label>

          <SubmitButton disabled={!customer} className="self-start">
            Gerar e baixar
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function downloadBase64File(base64: string, fileName: string): void {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
