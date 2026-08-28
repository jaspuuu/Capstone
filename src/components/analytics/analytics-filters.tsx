"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";

const selectCls =
  "h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-xs font-medium text-content focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15";

export type FilterOptions = {
  years: string[];
  yearsLabel: (ay: string) => string;
  /** Year preselected when no ay filter is present (must exist in `years`). */
  defaultAY: string;
  orgs: { id: string; label: string }[];
  colleges: string[];
  types: string[];
  recStatuses: { value: string; label: string }[];
};

export function AnalyticsFilters({ options }: { options: FilterOptions }) {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();

  function pick(key: string, value: string) {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    router.push(`${pathname}?${p.toString()}`);
  }

  function reset() {
    router.push(pathname);
  }

  return (
    <Card className="mb-6">
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-content-secondary uppercase">
              Academic Year
            </span>
            <select
              className={`${selectCls} w-full`}
              value={sp.get("ay") ?? options.defaultAY}
              onChange={(e) => pick("ay", e.target.value)}
            >
              {options.years.map((y) => (
                <option key={y} value={y}>
                  {options.yearsLabel(y)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-content-secondary uppercase">
              Organization
            </span>
            <select
              className={`${selectCls} w-full`}
              value={sp.get("org") ?? ""}
              onChange={(e) => pick("org", e.target.value)}
            >
              <option value="">All</option>
              {options.orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-content-secondary uppercase">
              College
            </span>
            <select
              className={`${selectCls} w-full`}
              value={sp.get("college") ?? ""}
              onChange={(e) => pick("college", e.target.value)}
            >
              <option value="">All</option>
              {options.colleges.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-content-secondary uppercase">
              Type
            </span>
            <select
              className={`${selectCls} w-full`}
              value={sp.get("type") ?? ""}
              onChange={(e) => pick("type", e.target.value)}
            >
              <option value="">All</option>
              {options.types.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-content-secondary uppercase">
              Recognition
            </span>
            <select
              className={`${selectCls} w-full`}
              value={sp.get("rec") ?? ""}
              onChange={(e) => pick("rec", e.target.value)}
            >
              <option value="">All</option>
              {options.recStatuses.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-xs font-semibold text-content hover:border-primary hover:text-primary"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Reset filters
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Card primitives pulled in here to keep the client component self-contained.
function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={className ? `rounded-2xl border border-line bg-surface shadow-card ${className}` : "rounded-2xl border border-line bg-surface shadow-card"}
    >
      {children}
    </div>
  );
}

function CardContent({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className="p-5">
      {children}
    </div>
  );
}