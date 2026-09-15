import Link from "next/link";
import { Card } from "@/components/ui/card";

export type StatusCell = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  href?: string;
  /** 0-100; renders a thin progress bar beneath the value. */
  progress?: number;
};

function Cell({ cell }: { cell: StatusCell }) {
  const body = (
    <>
      <p className="text-[11px] font-bold uppercase tracking-wide text-content-secondary">
        {cell.label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold tracking-tight text-content">
        {cell.value}
      </p>
      {typeof cell.progress === "number" && (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-strong"
          role="progressbar"
          aria-valuenow={cell.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${cell.progress}% of ${cell.label.toLowerCase()}`}
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.max(0, Math.min(100, cell.progress))}%` }}
          />
        </div>
      )}
      {cell.hint && <p className="mt-1.5 text-xs leading-relaxed text-content-muted">{cell.hint}</p>}
    </>
  );
  return (
    <Card className="border-t-2 border-t-primary p-5">
      {cell.href ? (
        <Link href={cell.href} className="block rounded-lg focus-visible:outline-primary">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}

/**
 * Compact 3-cell status summary replacing the previous KPI wall: recognition
 * standing, requirement readiness, and membership posture. No zero-activity
 * cards, no duplicated metrics.
 */
export function OfficerStatusSummary({ cells }: { cells: StatusCell[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cells.map((cell) => (
        <Cell key={cell.label} cell={cell} />
      ))}
    </div>
  );
}