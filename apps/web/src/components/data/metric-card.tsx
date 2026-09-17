import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  change?: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function MetricCard({ label, value, change, hint, icon, className }: MetricCardProps) {
  return (
    <Card className={cn("gap-3 px-5 py-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-body font-medium text-muted-foreground">{label}</p>
        {icon && <span className="text-subtle [&_svg]:size-4">{icon}</span>}
      </div>
      <p className="text-metric text-foreground tabular">{value}</p>
      {(change || hint) && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-small text-muted-foreground">
          {change}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </Card>
  );
}

export function MetricCardSkeleton() {
  return (
    <Card className="gap-3 px-5 py-5" aria-busy="true">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3.5 w-40" />
    </Card>
  );
}
