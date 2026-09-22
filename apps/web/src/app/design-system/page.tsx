import { Boxes, CalendarClock, MessageCircle, PackageSearch, Receipt } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DataTable, DataTableSkeleton, type DataTableColumn } from "@/components/data/data-table";
import { KanbanCard, KanbanColumn } from "@/components/data/kanban";
import { MetricCard, MetricCardSkeleton } from "@/components/data/metric-card";
import { MoneyValue, PercentageChange } from "@/components/data/money-value";
import { StatusBadge } from "@/components/data/status-badge";
import { Timeline } from "@/components/data/timeline";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer, PageHeader, SectionHeader } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/brand/logo";
import { getServerEnv } from "@/lib/env.server";
import { InteractiveShowcase, ThemeSwitch } from "./showcase";

export const metadata: Metadata = { title: "Design System" };

function isEnabled() {
  if (process.env.NODE_ENV !== "production") return true;
  try {
    return getServerEnv().ENABLE_DESIGN_SYSTEM_PAGE;
  } catch {
    return false;
  }
}

const PALETTE = {
  Superfícies: ["background", "card", "secondary", "accent", "border", "border-strong"],
  Texto: ["foreground", "muted-foreground", "subtle"],
  Semânticas: ["success", "warning", "danger", "info", "primary"],
  Gráficos: ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"],
};

const BRAND = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];

const NEUTRALS = [
  { name: "Black", token: "neutral-black", hex: "#000000" },
  { name: "Graphite", token: "neutral-graphite", hex: "#282828" },
  { name: "Slate", token: "neutral-slate", hex: "#666666" },
  { name: "Silver", token: "neutral-silver", hex: "#ADADAD" },
  { name: "Mist", token: "neutral-mist", hex: "#E0E0E0" },
  { name: "White", token: "neutral-white", hex: "#FFFFFF" },
];

const TYPE_SCALE = [
  { className: "text-title", label: "Page title", spec: "28 / 600" },
  { className: "text-section", label: "Section", spec: "20 / 600" },
  { className: "text-body font-medium", label: "Card title", spec: "14 / 500" },
  { className: "text-metric tabular", label: "R$ 18.420,90", spec: "Metric 28 / 600" },
  { className: "text-body", label: "Body", spec: "14 / 400" },
  { className: "text-small", label: "Small", spec: "13 / 400" },
  { className: "text-caption", label: "Caption", spec: "12 / 400" },
];

const SPACING = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64];
const RADII = [
  { label: "small", className: "rounded-sm", value: "8px" },
  { label: "input/button", className: "rounded-lg", value: "10px" },
  { label: "card", className: "rounded-xl", value: "16px" },
  { label: "modal", className: "rounded-2xl", value: "18px" },
  { label: "xl", className: "rounded-3xl", value: "20px" },
  { label: "pill", className: "rounded-full", value: "999px" },
];

interface SampleRow {
  id: string;
  product: string;
  sku: string;
  price: number;
  available: number;
  status: "ok" | "low" | "out";
}

const SAMPLE_ROWS: SampleRow[] = [
  {
    id: "1",
    product: "Whey Isolado 900g — Chocolate",
    sku: "WHY-ISO-900-CHO",
    price: 139.9,
    available: 12,
    status: "ok",
  },
  { id: "2", product: "Creatina Monohidratada 300g", sku: "CRE-MON-300", price: 89.9, available: 3, status: "low" },
  {
    id: "3",
    product: "Pré-treino 300g — Frutas vermelhas",
    sku: "PRE-300-FRV",
    price: 119.9,
    available: 0,
    status: "out",
  },
];

const STOCK_STATUS = {
  ok: { label: "Disponível", tone: "success" },
  low: { label: "Estoque baixo", tone: "warning" },
  out: { label: "Sem estoque", tone: "danger" },
} as const;

export default async function DesignSystemPage() {
  // Avaliado em runtime (não no build) para respeitar a variável do servidor.
  await connection();
  if (!isEnabled()) notFound();

  const columns: DataTableColumn<SampleRow>[] = [
    {
      id: "product",
      header: "Produto",
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.product}</span>
          <span className="font-mono text-caption text-muted-foreground">{row.sku}</span>
        </div>
      ),
    },
    { id: "price", header: "Preço", align: "right", cell: (row) => <MoneyValue value={row.price} /> },
    { id: "available", header: "Disponível", align: "right", cell: (row) => row.available },
    {
      id: "status",
      header: "Status",
      cell: (row) => <StatusBadge tone={STOCK_STATUS[row.status].tone}>{STOCK_STATUS[row.status].label}</StatusBadge>,
    },
  ];

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur lg:px-8">
        <div className="flex items-center gap-3">
          <Logo />
          <Badge variant="outline">Design System</Badge>
        </div>
        <ThemeSwitch />
      </header>

      <PageContainer className="gap-12">
        <PageHeader
          title="Design System"
          description="Referência visual oficial. Todos os exemplos usam dados fictícios e os mesmos componentes do produto."
        />

        <section className="flex flex-col gap-5">
          <SectionHeader title="Cores" description="Tokens semânticos — componentes nunca usam hex diretamente." />
          {Object.entries(PALETTE).map(([group, tokens]) => (
            <div key={group} className="flex flex-col gap-2">
              <h3 className="text-small font-medium text-muted-foreground">{group}</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {tokens.map((token) => (
                  <div key={token} className="overflow-hidden rounded-lg border border-border bg-card">
                    <div className="h-14 border-b border-border" style={{ background: `var(--${token})` }} />
                    <p className="px-2.5 py-2 font-mono text-caption">{token}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-2">
            <h3 className="text-small font-medium text-muted-foreground">Neutros</h3>
            <p className="text-caption text-muted-foreground">
              Paleta oficial da marca — monocromática, sem matiz. Toda a UI (superfícies, texto, bordas e a cor
              primária) deriva destes 6 tons, estendidos com as cores funcionais de feedback abaixo.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {NEUTRALS.map((neutral, index) => (
                <div
                  key={neutral.token}
                  className="flex h-28 flex-col justify-end rounded-xl border border-border p-3"
                  style={{ background: `var(--color-${neutral.token})` }}
                >
                  <span className={`font-medium ${index < 3 ? "text-white" : "text-neutral-black"}`}>
                    {neutral.name}
                  </span>
                  <span className={`font-mono text-caption ${index < 3 ? "text-white/60" : "text-neutral-black/55"}`}>
                    {neutral.hex}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-small font-medium text-muted-foreground">Marca (rampa)</h3>
            <div className="grid grid-cols-5 overflow-hidden rounded-xl border border-border sm:grid-cols-10">
              {BRAND.map((step) => (
                <div
                  key={step}
                  className="flex h-16 items-end p-2"
                  style={{ background: `var(--color-brand-${step})` }}
                >
                  <span className={`font-mono text-caption ${Number(step) >= 600 ? "text-white" : "text-brand-900"}`}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <SectionHeader title="Tipografia" description="Geist · valores com tabular-nums." />
          <Card>
            <CardContent className="flex flex-col divide-y divide-border">
              {TYPE_SCALE.map((item) => (
                <div key={item.spec} className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <span className={item.className}>{item.label}</span>
                  <span className="shrink-0 font-mono text-caption text-muted-foreground">{item.spec}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <SectionHeader title="Espaçamento" />
            <Card>
              <CardContent className="flex flex-col gap-2">
                {SPACING.map((size) => (
                  <div key={size} className="flex items-center gap-3">
                    <span className="w-8 font-mono text-caption text-muted-foreground tabular">{size}</span>
                    <span className="h-3 rounded-sm bg-brand-300 dark:bg-brand-700" style={{ width: size * 3 }} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-col gap-4">
            <SectionHeader title="Raios" />
            <div className="grid grid-cols-3 gap-3">
              {RADII.map((radius) => (
                <div key={radius.label} className="flex flex-col items-center gap-2">
                  <div className={`size-16 border border-border-strong bg-card ${radius.className}`} />
                  <span className="text-caption text-muted-foreground">
                    {radius.label} · {radius.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <InteractiveShowcase />

        <section className="flex flex-col gap-5">
          <SectionHeader title="Badges de status" description="Cor + ponto + texto: nunca dependem só de cor." />
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="success">Pago</StatusBadge>
            <StatusBadge tone="warning">Aguardando pagamento</StatusBadge>
            <StatusBadge tone="danger">Vencido</StatusBadge>
            <StatusBadge tone="info">Reservado</StatusBadge>
            <StatusBadge tone="brand">Compatível</StatusBadge>
            <StatusBadge tone="neutral">Informação insuficiente</StatusBadge>
            <Badge>Badge</Badge>
            <Badge variant="secondary">Secundário</Badge>
            <Badge variant="outline">Contorno</Badge>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <SectionHeader title="Cards e métricas" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Faturamento"
              value={<MoneyValue value={18420.9} />}
              change={<PercentageChange value={0.124} />}
              hint="vs. mês anterior"
            />
            <MetricCard
              label="Vendas"
              value="214"
              change={<PercentageChange value={-0.032} />}
              hint="vs. mês anterior"
            />
            <MetricCard
              label="Ticket médio"
              value={<MoneyValue value={86.08} />}
              change={<PercentageChange value={0} />}
              hint="vs. mês anterior"
            />
            <MetricCardSkeleton />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Card padrão</CardTitle>
              <CardDescription>Superfície, borda sutil, raio 16px, padding 20px, sem sombra forte.</CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground">Conteúdo do card.</CardContent>
          </Card>
        </section>

        <section className="flex flex-col gap-5">
          <SectionHeader
            title="Tabela"
            description="DataTable universal: busca, filtros, ordenação e paginação via URL."
          />
          <DataTable caption="Exemplo de tabela" columns={columns} rows={SAMPLE_ROWS} getRowKey={(row) => row.id} />
          <DataTableSkeleton rows={3} columns={4} />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <SectionHeader title="Timeline" />
            <Card>
              <CardContent>
                <Timeline
                  items={[
                    {
                      id: "1",
                      title: "Mensagem recebida",
                      description: "“Tem whey sem lactose?”",
                      timestamp: "10:42",
                      icon: <MessageCircle />,
                      tone: "info",
                    },
                    {
                      id: "2",
                      title: "Reserva criada",
                      description: "1× Whey Isolado 900g",
                      timestamp: "10:45",
                      icon: <CalendarClock />,
                      tone: "brand",
                    },
                    {
                      id: "3",
                      title: "Venda registrada",
                      description: "R$ 139,90 · Pix",
                      timestamp: "11:02",
                      icon: <Receipt />,
                      tone: "neutral",
                    },
                  ]}
                />
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-col gap-4">
            <SectionHeader title="Kanban" />
            <div className="flex gap-3 overflow-x-auto pb-2">
              <KanbanColumn title="Interessado" count={2}>
                <KanbanCard
                  customer="João Silva"
                  interest="Whey sem lactose, chocolate"
                  value="R$ 139,90"
                  origin="WhatsApp"
                  lastInteraction="há 5 min"
                />
                <KanbanCard
                  customer="Maria Souza"
                  interest="Creatina 300g"
                  value="R$ 89,90"
                  origin="Balcão"
                  lastInteraction="ontem"
                />
              </KanbanColumn>
              <KanbanColumn title="Reservado" count={1}>
                <KanbanCard
                  customer="Carlos Lima"
                  interest="Pré-treino"
                  value="R$ 119,90"
                  origin="WhatsApp"
                  lastInteraction="há 1 h"
                />
              </KanbanColumn>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <SectionHeader title="Estados vazios e carregamento" />
          <div className="grid gap-4 lg:grid-cols-2">
            <EmptyState
              icon={<PackageSearch />}
              title="Nenhum produto encontrado"
              description="Ajuste a busca ou cadastre um novo produto."
            />
            <Card className="gap-3">
              <CardContent className="flex flex-col gap-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex items-center gap-3 pt-2">
                  <Skeleton className="size-9 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Gráficos"
            description="Paleta de gráficos definida nos tokens chart-1…5. Componentes de gráfico entram com os dashboards."
          />
          <div className="flex items-center gap-2 text-small text-muted-foreground">
            <Boxes className="size-4" /> Pendente: ChartCard (Fase 8)
          </div>
        </section>
      </PageContainer>
    </div>
  );
}
