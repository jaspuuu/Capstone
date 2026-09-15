import Link from "next/link";
import { Download, Info } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Seal } from "@/components/ui/seal";
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

/** Quiet part kicker that opens each register section (folio numeral + note). */
export function PartLabel({
  numeral,
  name,
  note,
}: {
  numeral: string;
  name: string;
  note?: string;
}) {
  return (
    <div className="mb-3 mt-2 flex flex-wrap items-baseline gap-x-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-dark">
        {numeral} · {name}
      </span>
      {note && <span className="text-xs text-content-muted">· {note}</span>}
    </div>
  );
}

/** One figure on the folio's attention strip. */
export type FolioItem = { value: string; label: string; accent?: boolean };

/**
 * Register folio plate for the analytics workspace: a deep-ink opening page
 * with the institutional seal ghosted into the corner, the AY engraved on a
 * gilt foot rule, and a "needs attention" strip of ledger exceptions carried
 * along the foot — the officer's work queue above the register itself.
 */
export function AnalyticsFolio({
  rubric,
  title,
  description,
  action,
  items,
  ay,
}: {
  rubric: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  items: FolioItem[];
  ay: string;
}) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-primary-dark/40 bg-gradient-to-br from-primary-dark via-primary to-primary-hover px-6 py-6 shadow-raised sm:px-8">
      <Seal className="absolute -top-12 -right-10 size-48 rotate-12 opacity-10" />
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">{rubric}</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-pretty text-white/70">{description}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/10 pt-5 sm:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
              {it.label}
            </p>
            <p
              className={cn(
                "mt-1 font-display text-2xl font-bold tabular-nums",
                it.accent ? "text-gold-light" : "text-white"
              )}
            >
              {it.value}
            </p>
          </div>
        ))}
      </div>
      <span
        aria-hidden
        className="absolute right-6 bottom-0 left-6 h-px bg-gradient-to-r from-gold/70 via-gold/25 to-transparent"
      />
      <span className="absolute right-6 bottom-1.5 text-[10px] font-semibold tracking-[0.16em] text-gold/60 uppercase">
        AY {ay}
      </span>
    </div>
  );
}