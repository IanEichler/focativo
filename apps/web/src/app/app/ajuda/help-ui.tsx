import { ArrowUpRight, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Capítulo do guia: número, título, uma frase de contexto e o atalho para a tela. */
export function Topic({
  id,
  number,
  title,
  intro,
  href,
  hrefLabel,
  children,
}: {
  id: string;
  number: number;
  title: string;
  intro: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <Card>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-small font-semibold text-background tabular">
                {number}
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-section text-foreground">{title}</h2>
                <p className="text-body text-muted-foreground">{intro}</p>
              </div>
            </div>
            {href && (
              <Button variant="outline" size="sm" asChild className="self-start">
                <Link href={href}>
                  {hrefLabel ?? "Abrir"} <ArrowUpRight />
                </Link>
              </Button>
            )}
          </div>
          {children}
        </CardContent>
      </Card>
    </section>
  );
}

export function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-body font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

/** Passo a passo numerado. */
export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="flex flex-col gap-2.5 [counter-reset:step]">{children}</ol>;
}

export function Step({ children }: { children: React.ReactNode }) {
  return (
    <li className="relative pl-9 text-body text-muted-foreground [counter-increment:step] before:absolute before:top-0 before:left-0 before:flex before:size-6 before:items-center before:justify-center before:rounded-full before:bg-muted before:text-caption before:font-semibold before:text-foreground before:content-[counter(step)]">
      {children}
    </li>
  );
}

export function Bullets({ children }: { children: React.ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body text-muted-foreground">{children}</ul>;
}

export function Text({ children }: { children: React.ReactNode }) {
  return <p className="text-body text-muted-foreground">{children}</p>;
}

/** Nome de botão ou de tela, como aparece no sistema. */
export function Ui({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-center rounded-md border border-border bg-background px-1.5 py-px text-small font-medium whitespace-nowrap text-foreground">
      {children}
    </span>
  );
}

export function Tip({
  tone = "tip",
  title,
  children,
}: {
  tone?: "tip" | "warn";
  title: string;
  children: React.ReactNode;
}) {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-3 text-body",
        tone === "warn" ? "border-warning/30 bg-warning-soft" : "border-info/30 bg-info-soft",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "warn" ? "text-warning" : "text-info")} />
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-muted-foreground">{children}</span>
      </div>
    </div>
  );
}

/** Pedaço da tela real montado com dados de exemplo, emoldurado para não ser confundido com a tela de verdade. */
export function Example({
  caption,
  children,
  className,
}: {
  caption: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-3 sm:p-4",
        className,
      )}
    >
      <figcaption className="text-caption font-medium tracking-wide text-muted-foreground uppercase">
        Exemplo · {caption}
      </figcaption>
      {/* inert: ilustração, não a tela de verdade — sem foco, clique ou leitura duplicada. */}
      <div className="rounded-lg border border-border bg-card p-3 select-none sm:p-4" inert>
        {children}
      </div>
    </figure>
  );
}

/** Tabela simples de duas ou três colunas usada nas explicações. */
export function InfoTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-left text-body">
        <thead>
          <tr className="border-b border-border">
            {head.map((cell) => (
              <th key={cell} className="py-2 pr-4 font-medium text-foreground">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-border last:border-0">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(
                    "py-2 pr-4 align-top",
                    cellIndex === 0 ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Pergunta frequente que abre e fecha. */
export function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-border px-4 py-3">
      <summary className="cursor-pointer list-none font-medium text-foreground marker:hidden">
        <span className="mr-2 inline-block text-muted-foreground transition-transform group-open:rotate-90">›</span>
        {question}
      </summary>
      <div className="mt-2 pl-5 text-body text-muted-foreground">{children}</div>
    </details>
  );
}
