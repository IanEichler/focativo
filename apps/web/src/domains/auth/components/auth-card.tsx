import { Card } from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-6 px-6 py-7 sm:px-7">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-section text-foreground">{title}</h1>
          {description && <p className="text-body text-muted-foreground">{description}</p>}
        </div>
        {children}
      </Card>
      {footer && <p className="text-center text-body text-muted-foreground">{footer}</p>}
    </div>
  );
}
