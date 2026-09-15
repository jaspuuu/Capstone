import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

export type ProgressItem = {
  label: string;
  title: string;
  met: boolean;
};

/**
 * Recognition/compliance progress bar. Reusable on the officer dashboard and
 * the organization hub. Shows "n of m requirements completed" plus the status
 * of each requirement with an icon — never color alone (Web Content
 * Accessibility Guidelines 1.4.1).
 */
export function RecognitionProgress({
  orgId,
  academicYear,
  items,
  viewHref,
}: {
  orgId: string;
  academicYear: string;
  items: ProgressItem[];
  viewHref?: string;
}) {
  const met = items.filter((i) => i.met).length;
  const pct = items.length === 0 ? 0 : Math.round((met / items.length) * 100);

  return (
    <Card>
      <CardHeader icon={CheckCircle2} title="Recognition progress" description={`Application checklist · AY ${academicYear}`} />
      <CardContent>
        <div className="flex items-end justify-between gap-3">
          <p className="font-display text-2xl font-bold tracking-tight text-content">
            {met}
            <span className="text-base font-semibold text-content-muted">/{items.length} requirements met</span>
          </p>
          <p className="text-sm font-semibold tabular-nums text-primary">{pct}%</p>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-strong" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% of requirements complete`}>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>

        <ul className="mt-4 space-y-1.5">
          {items.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-sm">
              {item.met ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden />
              ) : (
                <Circle className="size-3.5 shrink-0 text-content-muted" aria-hidden />
              )}
              <span className="truncate">{item.title}</span>
            </li>
          ))}
        </ul>

        {viewHref && (
          <Link
            href={viewHref}
            className="mt-4 inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong px-3 text-xs font-semibold text-content hover:border-primary hover:text-primary"
          >
            {viewHref.includes("/accreditation") ? "View requirements" : "Open"} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}