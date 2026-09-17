import { MetricCardSkeleton } from "@/components/data/metric-card";
import { DataTableSkeleton } from "@/components/data/data-table";
import { PageContainer } from "@/components/layout/page";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <MetricCardSkeleton key={index} />
        ))}
      </div>
      <DataTableSkeleton />
    </PageContainer>
  );
}
