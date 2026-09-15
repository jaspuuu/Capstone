import { cn } from "@/lib/utils";

/**
 * Minimal server-rendered SVG charts (no client JS). Values are always shown
 * as text so no insight depends on color alone (§38).
 */

export type Point = { label: string; value: number };

/** Stable, unique-ish id suffix for SVG gradient defs (one gradient per chart). */
function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "chart";
}

export function BarChart({
  data,
  height = 160,
  barClassName,
  ariaLabel,
}: {
  data: Point[];
  height?: number;
  barClassName?: string;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = 100 / Math.max(1, data.length);
  const gid = `bargrad-${slug(ariaLabel)}`;
  return (
    <figure>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#174b7a" />
            <stop offset="100%" stopColor="#123b63" />
          </linearGradient>
        </defs>
        <line
          x1="0"
          y1={height - 20}
          x2="100"
          y2={height - 20}
          className="stroke-line-strong"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 28);
          return (
            <g key={d.label}>
              <rect
                x={i * slot + slot * 0.15}
                y={height - 20 - h}
                width={slot * 0.7}
                height={Math.max(h, d.value > 0 ? 2 : 0)}
                rx={3}
                className={barClassName}
                {...(barClassName ? {} : { fill: `url(#${gid})` })}
              />
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex justify-between gap-1 text-[11px] text-content-secondary">
        {data.map((d) => (
          <span key={d.label} className="flex-1 truncate text-center">
            <span className="block font-semibold text-content">{d.value}</span>
            {d.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function LineChart({
  data,
  height = 160,
  ariaLabel,
}: {
  data: Point[];
  height?: number;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const stepX = 100 / Math.max(1, data.length - 1 || 1);
  const pts = data.map((d, i) => ({
    x: data.length === 1 ? 50 : i * stepX,
    y: height - 22 - (d.value / max) * (height - 34),
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${path} L${pts[pts.length - 1]?.x ?? 0},${height - 20} L${pts[0]?.x ?? 0},${height - 20} Z`;
  const gid = `linegrad-${slug(ariaLabel)}`;
  const last = pts[pts.length - 1];
  return (
    <figure>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#174b7a" stopOpacity="0.28" />
            <stop offset="70%" stopColor="#174b7a" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#174b7a" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line
          x1="0"
          y1={height - 20}
          x2="100"
          y2={height - 20}
          className="stroke-line-strong"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {data.length > 1 && <path d={area} fill={`url(#${gid})`} />}
        <path
          d={path}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-primary"
          vectorEffect="non-scaling-stroke"
        />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === pts.length - 1 ? 2.2 : 1.5}
            className={i === pts.length - 1 ? "fill-gold" : "fill-primary"}
          />
        ))}
        {last && (
          <circle
            cx={last.x}
            cy={last.y}
            r={3.4}
            fill="none"
            strokeWidth={1.2}
            className="stroke-gold"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <figcaption className="mt-2 flex justify-between gap-1 text-[11px] text-content-secondary">
        {data.map((d) => (
          <span key={d.label} className="flex-1 truncate text-center">
            <span className="block font-semibold text-content">{d.value}</span>
            {d.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Compact horizontal proportion bar (e.g., compliance percentage). */
export function ProportionBar({
  value,
  total,
}: {
  value: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-surface-secondary"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}%`}
      >
        <div
          className={cn("h-full rounded-full", pct >= 70 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-danger")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-content">
        {pct}%
      </span>
    </div>
  );
}

/**
 * Coverage ring: the fraction of a *known total* that is in hand. A circle is
 * only meaningful for a portion of a whole (coverage), never for magnitudes
 * that can exceed the denominator — those get bars instead (§38: value is
 * always printed as text, never color alone).
 */
export function CoverageRing({
  value,
  total,
  size = 64,
  ariaLabel,
}: {
  value: number;
  total: number;
  size?: number;
  ariaLabel?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const R = 40;
  const C = 2 * Math.PI * R;
  const dash = (pct / 100) * C;
  return (
    <figure
      className="relative shrink-0"
      role="img"
      aria-label={ariaLabel ?? `Coverage ${pct}% of ${total}`}
    >
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth={12} className="stroke-surface-secondary" />
        {total > 0 && (
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={`${Math.max(dash - 0.01, 0)} ${C}`}
            transform="rotate(-90 50 50)"
            className={pct >= 70 ? "stroke-success" : pct >= 40 ? "stroke-warning" : "stroke-danger"}
          />
        )}
      </svg>
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center font-display text-[15px] font-bold tabular-nums text-content"
      >
        {pct}%
      </span>
    </figure>
  );
}

export type ArcTone = "gold" | "primary" | "success" | "warning" | "danger";

const ARC_TONES: Record<ArcTone, string> = {
  gold: "stroke-gold",
  primary: "stroke-primary",
  success: "stroke-success",
  warning: "stroke-warning",
  danger: "stroke-danger",
};

/**
 * Semicircular rail gauge for a measured quality on a closed scale (e.g. a
 * 1–5 rubric average or a 0–100 compliance share). The reading is always
 * printed inside the rail.
 */
export function ArcGauge({
  value,
  max,
  valueText,
  label,
  sub,
  size = 120,
  tone = "gold",
  ariaLabel,
}: {
  value: number;
  max: number;
  /** Exact reading to print (e.g. "4.2" or "87%"). Defaults to rounded value. */
  valueText?: string;
  label?: string;
  sub?: string;
  size?: number;
  tone?: ArcTone;
  ariaLabel: string;
}) {
  const clamped = Math.max(0, Math.min(value, max));
  const frac = max > 0 ? clamped / max : 0;
  // Half-circle arc (r=42) centered at (60,60): π·r.
  const L = Math.PI * 42;
  const text = valueText ?? `${Math.round(clamped)}`;
  return (
    <figure className="flex flex-col items-center">
      <svg
        viewBox="0 0 120 72"
        width={size}
        height={size * 0.6}
        role="img"
        aria-label={ariaLabel}
      >
        <path
          d="M18 60 A42 42 0 0 1 102 60"
          fill="none"
          strokeWidth={10}
          strokeLinecap="round"
          className="stroke-surface-secondary"
        />
        <path
          d="M18 60 A42 42 0 0 1 102 60"
          fill="none"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${frac * L} ${L}`}
          className={ARC_TONES[tone]}
        />
        <text
          x="60"
          y="58"
          textAnchor="middle"
          fontSize={16}
          fontWeight={700}
          className="fill-content font-display"
        >
          {text}
        </text>
      </svg>
      {(label || sub) && (
        <figcaption className="mt-1 max-w-full text-center text-xs leading-tight">
          {label && (
            <span className="block truncate font-semibold text-content">{label}</span>
          )}
          {sub && <span className="block text-content-secondary">{sub}</span>}
        </figcaption>
      )}
    </figure>
  );
}

export type SliceTone = "success" | "danger" | "warning" | "info" | "neutral" | "muted";

const SLICE_TONES: Record<SliceTone, { stroke: string; bg: string }> = {
  success: { stroke: "stroke-success", bg: "bg-success" },
  danger: { stroke: "stroke-danger", bg: "bg-danger" },
  warning: { stroke: "stroke-warning", bg: "bg-warning" },
  info: { stroke: "stroke-info", bg: "bg-info" },
  neutral: { stroke: "stroke-line-strong", bg: "bg-content-muted" },
  muted: { stroke: "stroke-surface-secondary", bg: "bg-surface-secondary" },
};

export type Slice = { label: string; value: number; tone: SliceTone };

/**
 * Donut chart for small status distributions (≤6 categories). Values are
 * always printed next to the legend, so no insight depends on color alone.
 */
export function DonutChart({
  data,
  ariaLabel,
  size = 108,
}: {
  data: Slice[];
  ariaLabel: string;
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = 40;
  const C = 2 * Math.PI * R;
  const GAP = 1.8; // hairline gap between slices
  let acc = 0;
  return (
    <figure className="flex items-center gap-4">
      <div className="relative shrink-0">
        <svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
          role="img"
          aria-label={total > 0 ? ariaLabel : `${ariaLabel} — no data`}
        >
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth={18} className="stroke-surface-secondary" />
          {total > 0 &&
            data.map((d) => {
              const frac = d.value / total;
              const dash = Math.max(frac * C - GAP, 0);
              const offset = -acc * C;
              acc += frac;
              if (dash <= 0) return null;
              return (
                <circle
                  key={d.label}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  strokeWidth={18}
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={offset}
                  transform="rotate(-90 50 50)"
                  className={SLICE_TONES[d.tone].stroke}
                />
              );
            })}
        </svg>
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold tabular-nums text-content"
        >
          {total}
        </span>
      </div>
      <figcaption className="grow space-y-1 text-xs">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className={cn("size-2.5 shrink-0 rounded-full", SLICE_TONES[d.tone].bg)} aria-hidden />
            <span className="text-content-secondary">{d.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-content">{d.value}</span>
          </div>
        ))}
      </figcaption>
    </figure>
  );
}
