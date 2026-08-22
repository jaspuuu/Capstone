import { cn } from "@/lib/utils";

/**
 * Minimal server-rendered SVG charts (no client JS). Values are always shown
 * as text so no insight depends on color alone (§38).
 */

export type Point = { label: string; value: number };

export function BarChart({
  data,
  height = 160,
  barClassName = "fill-primary",
  ariaLabel,
}: {
  data: Point[];
  height?: number;
  barClassName?: string;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = 100 / Math.max(1, data.length);
  return (
    <figure>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        role="img"
        aria-label={ariaLabel}
      >
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 24);
          return (
            <g key={d.label}>
              <rect
                x={i * slot + slot * 0.15}
                y={height - 20 - h}
                width={slot * 0.7}
                height={Math.max(h, d.value > 0 ? 2 : 0)}
                className={barClassName}
                rx={1}
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
  return (
    <figure>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        role="img"
        aria-label={ariaLabel}
      >
        {data.length > 1 && (
          <path d={area} className="fill-primary-light" opacity={0.6} />
        )}
        <path
          d={path}
          fill="none"
          strokeWidth={1.5}
          className="stroke-primary"
          vectorEffect="non-scaling-stroke"
        />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={1.4} className="fill-primary" />
        ))}
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
