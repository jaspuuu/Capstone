import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontal workflow progress (§46): makes "what is the current status?"
 * and "what happens next?" visible at a glance.
 */
export function WorkflowSteps({
  steps,
  currentIndex,
  className,
}: {
  steps: readonly { key: string; label: string }[];
  /** Index of the current step; -1 renders nothing active. */
  currentIndex: number;
  className?: string;
}) {
  return (
    <ol className={cn("flex items-center", className)} aria-label="Workflow progress">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={step.key} className="flex min-w-0 flex-1 items-center last:flex-none">
            <div className="flex min-w-0 flex-col items-center gap-1.5">
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                  done && "border-success bg-success text-white",
                  active && "border-primary bg-primary text-white ring-4 ring-primary/15",
                  !done && !active && "border-line-strong bg-surface text-content-muted"
                )}
              >
                {done ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <span aria-hidden>{i + 1}</span>
                )}
              </span>
              <span
                className={cn(
                  "max-w-full truncate text-center text-[11px] font-semibold",
                  active ? "text-primary" : done ? "text-success" : "text-content-muted"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "mx-1 mb-5 h-0.5 flex-1 rounded",
                  i < currentIndex ? "bg-success" : "bg-line"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Simple determinate progress bar. */
export function ProgressBar({
  value,
  max = 100,
  label,
  tone = "primary",
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  tone?: "primary" | "gold" | "success" | "warning";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const tones = {
    primary: "bg-primary",
    gold: "bg-gold",
    success: "bg-success",
    warning: "bg-warning",
  };
  return (
    <div className={className}>
      {label && (
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-content-secondary">
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary"
      >
        <div className={cn("h-full rounded-full transition-all", tones[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
