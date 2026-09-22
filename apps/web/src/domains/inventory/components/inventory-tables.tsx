import { DataTable, type DataTableColumn, type DataTablePagination } from "@/components/data/data-table";
import { MoneyValue } from "@/components/data/money-value";
import { StatusBadge } from "@/components/data/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatQuantity } from "@/lib/format";
import { EXPIRY_STATUS, MOVEMENT_ORIGIN, MOVEMENT_TYPE } from "../labels";
import type { LotRow, MovementRow } from "../queries";

function productLabel(row: { productName: string; variantName: string; hasVariants: boolean }) {
  return row.hasVariants ? `${row.productName} — ${row.variantName}` : row.productName;
}

export function LotsTable({
  rows,
  unit,
  showProduct = true,
  empty,
  toolbar,
  pagination,
}: {
  rows: LotRow[];
  unit?: string;
  showProduct?: boolean;
  empty?: React.ReactNode;
  toolbar?: React.ReactNode;
  pagination?: DataTablePagination;
}) {
  const columns: DataTableColumn<LotRow>[] = [
    ...(showProduct
      ? ([
          {
            id: "product",
            header: "Produto",
            cell: (lot) => (
              <span className="flex flex-col">
                <span className="font-medium">{productLabel(lot)}</span>
                {lot.sku && <span className="text-small text-muted-foreground">{lot.sku}</span>}
              </span>
            ),
          },
        ] as DataTableColumn<LotRow>[])
      : []),
    { id: "lot", header: "Lote", cell: (lot) => <span className="font-mono text-small">{lot.lotCode}</span> },
    {
      id: "expires",
      header: "Validade",
      cell: (lot) => (
        <span className="flex flex-col">
          <span className="tabular">{formatDate(lot.expiresOn)}</span>
          {lot.daysToExpiry !== null && lot.quantity > 0 && (
            <span className="text-caption text-muted-foreground">
              {lot.daysToExpiry < 0
                ? `vencido há ${Math.abs(lot.daysToExpiry)} dia(s)`
                : lot.daysToExpiry === 0
                  ? "vence hoje"
                  : `em ${lot.daysToExpiry} dia(s)`}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "status",
      header: "Situação",
      hideBelow: "sm",
      cell: (lot) =>
        lot.quantity > 0 ? (
          <StatusBadge tone={EXPIRY_STATUS[lot.expiryStatus].tone}>{EXPIRY_STATUS[lot.expiryStatus].label}</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Esgotado</StatusBadge>
        ),
    },
    { id: "supplier", header: "Fornecedor", hideBelow: "lg", cell: (lot) => lot.supplierName ?? "—" },
    { id: "quantity", header: "Saldo", align: "right", cell: (lot) => formatQuantity(lot.quantity, unit) },
  ];

  return (
    <DataTable
      caption="Lotes"
      columns={columns}
      rows={rows}
      getRowKey={(lot) => lot.lotId}
      empty={empty}
      toolbar={toolbar}
      pagination={pagination}
    />
  );
}

export function MovementsTable({
  rows,
  showProduct = true,
  showCosts,
  empty,
  toolbar,
  pagination,
}: {
  rows: MovementRow[];
  showProduct?: boolean;
  showCosts: boolean;
  empty?: React.ReactNode;
  toolbar?: React.ReactNode;
  pagination?: DataTablePagination;
}) {
  const columns: DataTableColumn<MovementRow>[] = [
    {
      id: "date",
      header: "Data",
      cell: (movement) => <span className="text-small tabular">{formatDateTime(movement.createdAt)}</span>,
    },
    ...(showProduct
      ? ([
          {
            id: "product",
            header: "Produto",
            cell: (movement) => <span className="font-medium">{productLabel(movement)}</span>,
          },
        ] as DataTableColumn<MovementRow>[])
      : []),
    {
      id: "type",
      header: "Tipo",
      cell: (movement) => (
        <span className="flex flex-col gap-0.5">
          <StatusBadge tone={MOVEMENT_TYPE[movement.type].tone} dot={false}>
            {MOVEMENT_TYPE[movement.type].label}
          </StatusBadge>
          {movement.origin !== "MANUAL" && (
            <span className="text-caption text-muted-foreground">{MOVEMENT_ORIGIN[movement.origin]}</span>
          )}
        </span>
      ),
    },
    {
      id: "quantity",
      header: "Quantidade",
      align: "right",
      cell: (movement) => {
        const delta = movement.physicalDelta !== 0 ? movement.physicalDelta : movement.reservedDelta;
        return (
          <span className={cn("font-medium", delta > 0 ? "text-success" : delta < 0 ? "text-danger" : undefined)}>
            {delta > 0 ? "+" : delta < 0 ? "−" : ""}
            {formatQuantity(Math.abs(delta))}
            {movement.physicalDelta === 0 && <span className="ml-1 text-caption text-muted-foreground">reserv.</span>}
          </span>
        );
      },
    },
    {
      id: "after",
      header: "Saldo após",
      align: "right",
      hideBelow: "md",
      cell: (movement) => formatQuantity(movement.physicalAfter),
    },
    {
      id: "detail",
      header: "Detalhes",
      hideBelow: "lg",
      className: "max-w-xs whitespace-normal",
      cell: (movement) => (
        <span className="flex flex-col text-small">
          {movement.reason && <span>{movement.reason}</span>}
          {movement.lots.length > 0 && (
            <span className="text-muted-foreground">
              Lotes:{" "}
              {movement.lots
                .map((lot) => `${lot.code} (${lot.delta > 0 ? "+" : ""}${formatQuantity(lot.delta)})`)
                .join(", ")}
            </span>
          )}
          {showCosts && movement.unitCost !== null && (
            <span className="text-muted-foreground">
              Custo unit.: <MoneyValue value={movement.unitCost} />
            </span>
          )}
        </span>
      ),
    },
    {
      id: "actor",
      header: "Responsável",
      hideBelow: "md",
      cell: (movement) => (
        <span className="text-small text-muted-foreground">
          {movement.actorName ??
            (movement.actorType === "SYSTEM" ? "Sistema" : movement.actorType === "AI" ? "IA" : "—")}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      caption="Movimentações de estoque"
      columns={columns}
      rows={rows}
      getRowKey={(movement) => movement.id}
      empty={empty}
      toolbar={toolbar}
      pagination={pagination}
    />
  );
}
