"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { renderAsync } from "docx-preview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDocumentTemplateFileAction } from "../actions";
import { fillTemplateBytes } from "../fill-template-core";

const EMPTY_MARK = "________";
const POLL_MS = 400;

/**
 * Prévia do contrato ao lado do formulário: preenche o próprio .docx do modelo
 * no navegador com o que está digitado e renderiza as páginas. Lê o formulário
 * por amostragem (e não por eventos) porque vários campos são inputs ocultos
 * atualizados por estado — data por extenso, endereço, serviço da sessão.
 */
export function ContractLivePreview({
  templateId,
  fields,
  autoFilled,
  formRef,
}: {
  templateId: string;
  fields: string[];
  autoFilled: Record<string, string>;
  formRef: RefObject<HTMLFormElement | null>;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [template, setTemplate] = useState<Uint8Array | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    getDocumentTemplateFileAction(templateId)
      .then((base64) => {
        if (cancelled) return;
        if (!base64) return setStatus("error");
        setTemplate(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)));
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  useEffect(() => {
    if (!template) return;
    let lastSnapshot = "";
    let rendering = false;

    function fitToWidth() {
      const viewport = viewportRef.current;
      const pages = pagesRef.current;
      if (!viewport || !pages || viewport.clientWidth === 0) return;
      pages.style.zoom = "1";
      const pageWidth = pages.scrollWidth;
      if (pageWidth > 0) pages.style.zoom = String(Math.min(1, viewport.clientWidth / pageWidth));
    }

    async function refresh() {
      const form = formRef.current;
      const pages = pagesRef.current;
      if (!form || !pages || rendering) return;
      const formData = new FormData(form);
      const data: Record<string, string> = {};
      for (const field of fields) {
        const typed = formData.get(`field_${field}`);
        data[field] = String(typed ?? autoFilled[field] ?? "").trim();
      }
      const snapshot = JSON.stringify(data);
      if (snapshot === lastSnapshot) return;
      lastSnapshot = snapshot;
      rendering = true;
      try {
        const filled = fillTemplateBytes(template!, data, { emptyValue: EMPTY_MARK });
        const scrollTop = viewportRef.current?.scrollTop ?? 0;
        await renderAsync(filled, pages, undefined, { className: "docx", inWrapper: true, breakPages: true });
        fitToWidth();
        if (viewportRef.current) viewportRef.current.scrollTop = scrollTop;
        setStatus("ready");
      } catch {
        setStatus("error");
      } finally {
        rendering = false;
      }
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const observer = new ResizeObserver(fitToWidth);
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
    };
  }, [template, fields, autoFilled, formRef]);

  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader>
        <CardTitle>Prévia do contrato</CardTitle>
        <p className="text-small text-muted-foreground">
          Atualiza enquanto você preenche. Campos em branco aparecem como {EMPTY_MARK}.
        </p>
      </CardHeader>
      <CardContent>
        {status === "loading" && <p className="text-small text-muted-foreground">Carregando o modelo…</p>}
        {status === "error" && (
          <p role="alert" className="text-small text-warning">
            Não foi possível montar a prévia. O contrato ainda pode ser gerado normalmente.
          </p>
        )}
        <div
          ref={viewportRef}
          aria-label="Prévia do contrato"
          className="max-h-[calc(100vh-14rem)] overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-muted/40 [&_.docx-wrapper]:bg-transparent [&_.docx-wrapper]:p-3 [&_.docx-wrapper>section.docx]:mb-3 [&_.docx-wrapper>section.docx]:shadow-sm"
          hidden={status !== "ready"}
        >
          <div ref={pagesRef} />
        </div>
      </CardContent>
    </Card>
  );
}
