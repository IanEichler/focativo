import { Package } from "lucide-react";
import Image from "next/image";
import { StatusBadge } from "@/components/data/status-badge";
import { productImageUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import type { CharacteristicChip } from "../characteristics";
import { STOCK_STATUS, type StockStatus } from "../labels";

export function ProductThumbnail({
  path,
  name,
  size = 40,
  className,
}: {
  path: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const url = productImageUrl(path);
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {url ? (
        <Image src={url} alt={name} fill sizes={`${size * 2}px`} className="object-cover" />
      ) : (
        <Package className="size-[45%] text-subtle" aria-hidden="true" />
      )}
    </span>
  );
}

export function StockStatusBadge({ status }: { status: StockStatus | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <StatusBadge tone={STOCK_STATUS[status].tone}>{STOCK_STATUS[status].label}</StatusBadge>;
}

const CHIP_TONE: Record<CharacteristicChip["tone"], string> = {
  positive: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  neutral: "bg-secondary text-foreground",
  unknown: "border border-dashed border-border-strong text-muted-foreground",
};

export function CharacteristicChips({ chips, empty }: { chips: CharacteristicChip[]; empty?: React.ReactNode }) {
  if (!chips.length) return empty ? <div className="text-body text-muted-foreground">{empty}</div> : null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Características">
      {chips.map((chip) => (
        <li key={chip.key} className={cn("rounded-full px-2.5 py-1 text-small font-medium", CHIP_TONE[chip.tone])}>
          {chip.label}
        </li>
      ))}
    </ul>
  );
}
