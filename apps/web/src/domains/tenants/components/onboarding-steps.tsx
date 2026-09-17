import { Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ONBOARDING_STEPS, type OnboardingStepId } from "../onboarding";

export function OnboardingSteps({
  completed,
  current,
  linkable = true,
}: {
  completed: ReadonlySet<OnboardingStepId>;
  current?: OnboardingStepId;
  linkable?: boolean;
}) {
  const total = ONBOARDING_STEPS.length;
  const doneCount = ONBOARDING_STEPS.filter((step) => completed.has(step.id)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-small text-muted-foreground">
          <span>Configuração inicial</span>
          <span className="tabular">
            {doneCount} de {total}
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={doneCount}
          aria-label="Progresso da configuração inicial"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(doneCount / total) * 100}%` }}
          />
        </div>
      </div>

      <ol className="flex flex-col">
        {ONBOARDING_STEPS.map((step, index) => {
          const done = completed.has(step.id);
          const isCurrent = !done && step.id === current;
          const soon = step.availability === "soon";
          const body = (
            <>
              <span
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular",
                  done && "border-primary bg-primary text-primary-foreground",
                  isCurrent && "border-primary text-primary",
                  !done && !isCurrent && "border-border-strong text-muted-foreground",
                )}
                aria-hidden="true"
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="flex min-w-0 flex-col">
                <span
                  className={cn("text-body font-medium", soon && !done ? "text-muted-foreground" : "text-foreground")}
                >
                  {step.title}
                  <span className="sr-only">
                    {done ? " (concluído)" : soon ? " (em breve)" : isCurrent ? " (etapa atual)" : ""}
                  </span>
                </span>
                <span className="text-small text-muted-foreground">
                  {soon && !done ? "Em breve" : step.description}
                </span>
              </span>
            </>
          );

          return (
            <li key={step.id}>
              {linkable && step.href && !done && !soon ? (
                <Link
                  href={step.href}
                  className="flex gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex gap-3 px-2 py-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
