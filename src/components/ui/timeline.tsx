import { cn } from "@/lib/utils";

export type TimelineItem = {
  id: string;
  title: string;
  meta?: string;
  body?: string | null;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "gold";
  actor?: string | null;
};

const DOT_TONES: Record<NonNullable<TimelineItem["tone"]>, string> = {
  neutral: "bg-content-muted",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  gold: "bg-gold",
};

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  if (items.length === 0) {
    return <p className="px-5 py-4 text-sm text-content-muted">No activity recorded yet.</p>;
  }
  return (
    <ol className={cn("relative space-y-5 px-5 py-4", className)}>
      {items.map((item, i) => (
        <li key={item.id} className="relative flex gap-3">
          {/* connector */}
          {i < items.length - 1 && (
            <span
              aria-hidden
              className="absolute top-5 left-[7px] h-[calc(100%-8px)] w-0.5 bg-line"
            />
          )}
          <span
            aria-hidden
            className={cn(
              "relative mt-1.5 size-3.5 shrink-0 rounded-full border-2 border-surface ring-1 ring-line-strong",
              DOT_TONES[item.tone ?? "neutral"]
            )}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-content">{item.title}</p>
            {item.meta && (
              <p className="mt-0.5 text-xs text-content-muted">
                {item.meta}
                {item.actor ? ` · ${item.actor}` : ""}
              </p>
            )}
            {item.body && (
              <p className="mt-1 rounded-lg bg-surface-secondary px-3 py-2 text-sm whitespace-pre-wrap text-content-secondary">
                {item.body}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
