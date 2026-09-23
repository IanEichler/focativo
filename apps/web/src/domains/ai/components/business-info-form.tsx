"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { TextareaField } from "@/components/forms/fields";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IDLE, type ActionState } from "@/lib/errors";
import { saveAiBusinessInfoAction } from "../actions";
import type { AiBusinessInfoField } from "../schemas";
import type { AiBusinessInfo, FaqItem } from "../queries";

/**
 * FAQ e ordem de triagem viram JSON num campo escondido no submit — mesmo
 * padrão de professionalUserIds em agenda/components/service-form.tsx.
 */
export function BusinessInfoForm({ info }: { info: AiBusinessInfo }) {
  const [state, action] = useActionState<ActionState<AiBusinessInfoField>, FormData>(saveAiBusinessInfoAction, IDLE);
  useActionFeedback(state, { toastOnError: true });

  const [faq, setFaq] = useState<FaqItem[]>(info.faq);
  const [flow, setFlow] = useState<string[]>(info.screeningFlow);

  function updateFaq(index: number, patch: Partial<FaqItem>) {
    setFaq((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function updateFlow(index: number, value: string) {
    setFlow((prev) => prev.map((item, i) => (i === index ? value : item)));
  }

  return (
    <form action={action} className="flex flex-col gap-6">
      <FormMessage state={state.status === "error" ? state : IDLE} />
      <input type="hidden" name="faq" value={JSON.stringify(faq)} />
      <input type="hidden" name="screeningFlow" value={JSON.stringify(flow)} />

      <TextareaField
        label="Descrição do negócio"
        name="businessDescription"
        rows={3}
        maxLength={2000}
        placeholder="Ex.: Clínica de estética facial e corporal, atendimento por hora marcada."
        defaultValue={info.businessDescription ?? undefined}
        error={fieldError(state, "businessDescription")}
      />

      <TextareaField
        label="Políticas gerais"
        name="generalPolicies"
        rows={3}
        maxLength={2000}
        placeholder="Ex.: Cancelamento com 24h de antecedência. Aceita Pix e cartão."
        defaultValue={info.generalPolicies ?? undefined}
        error={fieldError(state, "generalPolicies")}
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-body font-medium">Perguntas frequentes</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFaq((prev) => [...prev, { question: "", answer: "" }])}
            disabled={faq.length >= 20}
          >
            <Plus /> Adicionar
          </Button>
        </div>
        {faq.map((item, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start">
            <div className="flex flex-1 flex-col gap-2">
              <TextField
                label="Pergunta"
                name={`faq-question-${index}`}
                maxLength={200}
                value={item.question}
                onChange={(e) => updateFaq(index, { question: e.target.value })}
              />
              <TextField
                label="Resposta"
                name={`faq-answer-${index}`}
                maxLength={500}
                value={item.answer}
                onChange={(e) => updateFaq(index, { answer: e.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFaq((prev) => prev.filter((_, i) => i !== index))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        {faq.length === 0 && <p className="text-small text-muted-foreground">Nenhuma pergunta cadastrada.</p>}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-body font-medium">Ordem sugerida de triagem</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFlow((prev) => [...prev, ""])}
            disabled={flow.length >= 12}
          >
            <Plus /> Adicionar passo
          </Button>
        </div>
        <p className="text-small text-muted-foreground">
          Orientação pra IA seguir (não é um roteiro rígido) — ex.: se apresentar e perguntar se já é cliente, depois
          perguntar qual serviço deseja.
        </p>
        {flow.map((step, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-small text-muted-foreground">{index + 1}.</span>
            <Input
              aria-label={`Passo ${index + 1} da triagem`}
              className="flex-1"
              name={`flow-step-${index}`}
              maxLength={200}
              value={step}
              onChange={(e) => updateFlow(index, e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFlow((prev) => prev.filter((_, i) => i !== index))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        {flow.length === 0 && <p className="text-small text-muted-foreground">Nenhum passo cadastrado.</p>}
      </div>

      <SubmitButton pendingLabel="Salvando…" className="self-start">
        Salvar conhecimento de negócio
      </SubmitButton>
    </form>
  );
}
