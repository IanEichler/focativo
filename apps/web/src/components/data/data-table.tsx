import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface DataTableColumn<Row> {
  id: string;
  header: React.ReactNode;
  cell: (row: Row) => React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  sortable?: boolean;
  /** Oculta a coluna abaixo do breakpoint (tabelas densas no mobile). */
  hideBelow?: "sm" | "md" | "lg";
}

export interface DataTableSort {
  by?: string;
  direction?: "asc" | "desc";
  hrefFor: (columnId: string) => string;
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}

interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  caption: string;
  empty?: React.ReactNode;
  toolbar?: React.ReactNode;
  sort?: DataTableSort;
  pagination?: DataTablePagination;
  className?: string;
}

const HIDE_CLASS = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;
const ALIGN_CLASS = { left: "text-left", right: "text-right", center: "text-center" } as const;

/**
 * Tabela universal. Funciona em Server Components: ordenação, busca e
 * paginação são refletidas na URL (links), sem estado oculto no cliente.
 */
export function DataTable<Row>({
  columns,
  rows,
  getRowKey,
  caption,
  empty,
  toolbar,
  sort,
  pagination,
  className,
}: DataTableProps<Row>) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {toolbar}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {rows.length === 0 && empty ? (
          <div className="p-2">{empty}</div>
        ) : (
          <Table>
            <caption className="sr-only">{caption}</caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((column) => (
                  <TableHead
                    key={column.id}
                    scope="col"
                    aria-sort={ariaSort(sort, column.id)}
                    className={cn(
                      ALIGN_CLASS[column.align ?? "left"],
                      column.hideBelow && HIDE_CLASS[column.hideBelow],
                      column.className,
                    )}
                  >
                    {column.sortable && sort ? <SortLink column={column} sort={sort} /> : column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={getRowKey(row)}>
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      className={cn(
                        ALIGN_CLASS[column.align ?? "left"],
                        column.align === "right" && "tabular",
                        column.hideBelow && HIDE_CLASS[column.hideBelow],
                        column.className,
                      )}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {pagination && pagination.total > 0 && <Pagination {...pagination} />}
    </div>
  );
}

function ariaSort(sort: DataTableSort | undefined, columnId: string): "ascending" | "descending" | undefined {
  if (!sort || sort.by !== columnId) return undefined;
  return sort.direction === "desc" ? "descending" : "ascending";
}

function SortLink<Row>({ column, sort }: { column: DataTableColumn<Row>; sort: DataTableSort }) {
  const active = sort.by === column.id;
  const Icon = !active ? ArrowUpDown : sort.direction === "desc" ? ArrowDown : ArrowUp;
  return (
    <Link
      href={sort.hrefFor(column.id)}
      scroll={false}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active && "text-foreground",
      )}
    >
      {column.header}
      <Icon className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

export function Pagination({ page, pageSize, total, hrefFor }: DataTablePagination) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3 text-small text-muted-foreground">
      <p className="tabular">
        {formatNumber(from)}–{formatNumber(to)} de {formatNumber(total)}
      </p>
      <div className="flex items-center gap-1.5">
        <PageButton href={page > 1 ? hrefFor(page - 1) : undefined} label="Página anterior">
          <ChevronLeft />
        </PageButton>
        <span className="px-1.5 tabular">
          {page} / {pages}
        </span>
        <PageButton href={page < pages ? hrefFor(page + 1) : undefined} label="Próxima página">
          <ChevronRight />
        </PageButton>
      </div>
    </nav>
  );
}

function PageButton({ href, label, children }: { href?: string; label: string; children: React.ReactNode }) {
  if (!href) {
    return (
      <Button variant="outline" size="icon-sm" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="icon-sm" asChild>
      <Link href={href} aria-label={label} scroll={false}>
        {children}
      </Link>
    </Button>
  );
}

export function DataTableSkeleton({ columns = 5, rows = 6 }: { columns?: number; rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" aria-busy="true" aria-label="Carregando">
      <div className="flex h-10 items-center gap-6 border-b border-border px-3">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-3 w-20" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex h-12 items-center gap-6 border-b border-border px-3 last:border-0">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} className={cn("h-3.5", column === 0 ? "w-40" : "w-20")} />
          ))}
        </div>
      ))}
    </div>
  );
}
