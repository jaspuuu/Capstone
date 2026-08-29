import Link from "next/link";
import { Download, Info } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Data-integrity note: distinguish "0" from "no data" (analytics prompt §25). */
export function NoData({ what, hint }: { what: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-secondary px-3.5 py-3 text-sm">
      <Info className="mt-0.5 size-4 shrink-0 text-content-muted" aria-hidden />
      <div>
        <p className="font-semibold text-content">Insufficient data</p>
        <p className="mt-0.5 text-xs text-content-secondary">
          {what}
          {hint ? ` ${hint}` : ""}
        </p>
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        description={description}
        actions={action}
      />
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** KPI card with big value, optional cycle delta, and a breakdown area. */
export function KpiCard({
  label,
  value,
  valueHint,
  delta,
  hint,
  children,
}: {
  label: string;
  value: string;
  valueHint?: string;
  /** Percentage-point delta vs previous cycle (null = none). */
  delta?: number | null;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={label} />
      <CardContent>
        <p className="font-display text-3xl font-bold text-content tabular-nums">
          {value}
          {valueHint && <span className="ml-1 text-sm font-semibold text-content-secondary">{valueHint}</span>}
        </p>
        {delta != null && delta !== 0 ? (
          <p
            className={cn(
              "mt-1 text-xs font-semibold",
              delta > 0 ? "text-success" : "text-danger"
            )}
          >
            {delta > 0 ? "↑" : "↓"} {Math.abs(delta)} pts from previous cycle
          </p>
        ) : delta != null ? (
          <p className="mt-1 text-xs font-semibold text-content-muted">flat vs previous cycle</p>
        ) : null}
        {hint && <p className="mt-1 text-xs text-content-secondary">{hint}</p>}
        {children && <div className="mt-3">{children}</div>}
      </CardContent>
    </Card>
  );
}

/** Horizontal ranking bar (requirement gaps, etc.). */
export function HBar({
  label,
  percent,
  rightText,
  tone = "bg-danger",
}: {
  label: string;
  percent: number;
  rightText: string;
  tone?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate font-medium text-content-secondary">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-content">{rightText}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-secondary">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** CSV + Excel export links for the current filter set (respect the same scope). */
export function ExportAnalyticsLink({
  params,
  label = "Export CSV",
  showExcel = true,
}: {
  params: string;
  label?: string;
  showExcel?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/export/analytics?${params}`}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-content hover:border-primary hover:text-primary"
      >
        <Download className="size-4" aria-hidden />
        {label}
      </Link>
      {showExcel && (
        <Link
          href={`/export/analytics.xlsx?${params}`}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-content hover:border-primary hover:text-primary"
        >
          <Download className="size-4" aria-hidden />
          Export Excel
        </Link>
      )}
    </div>
  );
}