"use client";

import { useActionState, useId } from "react";
import { DialogFormLayout, FormDialog } from "@/components/forms/form-dialog";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { IDLE, type ActionState } from "@/lib/errors";
import { uploadDocumentTemplateAction } from "../actions";
import type { UploadTemplateField } from "../schemas";

export function UploadTemplateDialog({ trigger }: { trigger: React.ReactNode }) {
  return (
    <FormDialog
      trigger={trigger}
      title="Novo modelo"
      description="Envie um arquivo .docx com campos {assim} ou {{assim}} para preencher depois."
    >
      {(close) => <UploadTemplateForm onDone={close} />}
    </FormDialog>
  );
}

function UploadTemplateForm({ onDone }: { onDone: () => void }) {
  const [state, action] = useActionState<ActionState<UploadTemplateField>, FormData>(
    uploadDocumentTemplateAction,
    IDLE,
  );
  const fileId = useId();
  useActionFeedback(state, { onSuccess: onDone });

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col" noValidate>
      <DialogFormLayout
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <SubmitButton pendingLabel="Enviando…">Cadastrar modelo</SubmitButton>
          </>
        }
      >
        <FormMessage state={state.status === "error" ? state : IDLE} />

        <TextField
          label="Nome do modelo"
          name="name"
          required
          autoFocus
          placeholder="Contrato padrão"
          error={fieldError(state, "name")}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fileId} className="text-body font-medium text-foreground">
            Arquivo .docx
          </Label>
          <input
            id={fileId}
            type="file"
            name="file"
            required
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="rounded-lg border border-input bg-card px-3 py-2 text-body file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-small file:font-medium"
          />
          <p className="text-small text-muted-foreground">
            Use campos como <code>{"{cliente_nome}"}</code> e <code>{"{cliente_cpf}"}</code> no texto do documento — o
            sistema descobre sozinho quais campos existem.
          </p>
        </div>
      </DialogFormLayout>
    </form>
  );
}
