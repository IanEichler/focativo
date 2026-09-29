"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/forms/text-field";
import { Spinner } from "@/components/ui/spinner";
import { captureSigningLocation } from "../location-browser";

type PublicState = { status: string; accessible: boolean; expiresAt: string; signerName?: string; documentName?: string; documentHash?: string; consentText?: string; consentVersion?: string };
export function PublicSignatureForm({ token }: { token: string }) {
  const api = `/api/assinaturas/${encodeURIComponent(token)}`;
  const [data, setData] = useState<PublicState | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [locating, setLocating] = useState(false);
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [hasDrawing, setHasDrawing] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const busy = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(api, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message || "Não foi possível carregar o contrato."); });
    return () => controller.abort();
  }, [api]);
  useEffect(() => {
    if (!data?.accessible || data.status === "SIGNED") return;
    let active = true; let objectUrl = "";
    void fetch(`${api}?file=original`, { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Não foi possível abrir o PDF. Recarregue a página ou solicite um novo link à clínica.");
      const bytes = await response.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      if (actual !== data.documentHash) throw new Error("O documento não passou na verificação de integridade.");
      if (active) { objectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })); setPdfUrl(objectUrl); setPdfReady(true); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [api, data?.accessible, data?.status, data?.documentHash]);
  async function action(body: Record<string, unknown>) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      setLocating(true);
      const location = await captureSigningLocation();
      setLocating(false);
      const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, location }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const updated = await fetch(api, { cache: "no-store" }); const details = await updated.json();
      if (!updated.ok) throw new Error(details.error);
      setData(details);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha de conexão. Tente novamente."); }
    finally { busy.current = false; setPending(false); setLocating(false); }
  }
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * 700 / rect.width, y: (event.clientY - rect.top) * 180 / rect.height };
  }
  return <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-6">
    {error && <p role="alert" className="rounded-md bg-danger-soft p-3 text-danger">{error}</p>}
    {!data && !error && <p role="status">Carregando…</p>}
    {data?.status === "SIGNED" ? <>
      <h2 className="text-xl font-semibold text-success">Contrato assinado</h2>
      <p>O aceite foi registrado e o contrato está disponível para a clínica.</p>
      {data.accessible ? <Button asChild><a href={`${api}?file=signed`}>Baixar contrato e comprovante</a></Button> : <p>Solicite à clínica uma cópia do documento assinado.</p>}
    </> : data && !data.accessible ? <>
      <p>Solicite à clínica um novo link para acessar este contrato.</p>
    </> : data && <>
      <h2 className="text-lg font-semibold">1. Confira o contrato</h2>
      <p>{data.documentName} · {data.signerName}</p>
      {pdfReady ? <>
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="underline">Abrir o PDF em outra aba para leitura</a>
        <iframe title="Contrato para leitura" src={pdfUrl} className="h-[60vh] min-h-80 w-full rounded-md border border-border bg-white" />
      </> : <p role="status">Verificando e carregando o PDF…</p>}
      <form className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); void action({ action: "sign", name, accepted, consentVersion: data.consentVersion, ...(hasDrawing && canvas.current ? { signature: canvas.current.toDataURL("image/png") } : {}) }); }}>
        <h2 className="text-lg font-semibold">2. Confirme sua assinatura</h2>
        <TextField label="Digite seu nome completo como aparece no contrato" name="name" value={name} onChange={e => setName(e.target.value)} required disabled={pending} maxLength={160} />
        <div className="flex flex-col gap-2">
          <p>Desenhe sua assinatura, se desejar (opcional)</p>
          <canvas ref={canvas} width={700} height={180} aria-label="Área opcional para desenhar assinatura" className="h-36 w-full touch-none rounded-md border border-input bg-white"
            onPointerDown={e => { if (pending) return; const ctx = canvas.current?.getContext("2d"); if (!ctx) return; e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; const p = point(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#111"; }}
            onPointerMove={e => { if (!drawing.current) return; const ctx = canvas.current?.getContext("2d"); const p = point(e); ctx?.lineTo(p.x, p.y); ctx?.stroke(); setHasDrawing(true); }}
            onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
          <Button type="button" variant="ghost" disabled={pending} className="self-start" onClick={() => { canvas.current?.getContext("2d")?.clearRect(0,0,700,180); setHasDrawing(false); }}>Limpar desenho</Button>
        </div>
        <label className="flex items-start gap-3"><input type="checkbox" checked={accepted} disabled={pending} onChange={e => setAccepted(e.target.checked)} required className="mt-1 size-4 shrink-0" /><span>{data.consentText}</span></label>
        <p className="rounded-lg bg-secondary p-3 text-small text-muted-foreground">Ao assinar, registramos seu IP e solicitamos sua localização ao navegador. A localização é opcional: se você não permitir ou ela estiver indisponível, a assinatura continua e essa condição fica registrada.</p>
        {locating && <p role="status" className="text-small text-muted-foreground">Aguardando a permissão de localização do navegador…</p>}
        <Button type="submit" disabled={pending || !accepted || !pdfReady || !name.trim()}>{pending && <Spinner />}{locating ? "Obtendo localização…" : pending ? "Registrando assinatura…" : "Assinar contrato"}</Button>
      </form>
    </>}
    <p className="text-small text-muted-foreground">A assinatura é feita por este link, sem e-mail ou código. A clínica armazena o contrato e os registros do aceite.</p>
  </div>;
}
