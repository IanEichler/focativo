import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <Empty className={cn("border border-dashed border-border bg-card py-12", className)}>
      <EmptyHeader>
        {icon && (
          <EmptyMedia variant="icon" className="bg-secondary text-muted-foreground">
            {icon}
          </EmptyMedia>
        )}
        <EmptyTitle className="text-body font-medium">{title}</EmptyTitle>
        {description && <EmptyDescription className="text-body">{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
