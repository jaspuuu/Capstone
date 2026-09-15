import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  PenLine,
  RotateCcw,
  UserPlus,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export type ActionItem = {
  id: string;
  kind: "signature" | "resubmit" | "application" | "requirements";
  title: string;
  subtitle: string;
  org?: string;
  href: string;
  cta: string;
};

const KIND_META = {
  signature: {
    icon: PenLine,
    tile: "bg-primary/10 text-primary",
    cta: "bg-primary text-white hover:bg-primary-hover",
    reason: "Signature required",
  },
  resubmit: {
    icon: RotateCcw,
    tile: "bg-gold/10 text-gold-dark",
    cta: "bg-gold text-primary-dark hover:bg-gold-dark hover:text-white",
    reason: "Returned for revision",
  },
  application: {
    icon: UserPlus,
    tile: "bg-info/10 text-info",
    cta: "bg-info text-white hover:bg-info-dark",
    reason: "Awaiting your review",
  },
  requirements: {
    icon: ClipboardList,
    tile: "bg-warning/10 text-warning",
    cta: "bg-warning text-primary-dark hover:bg-warning-dark",
    reason: "Incomplete",
  },
} as const;

/**
 * ACTION REQUIRED — the primary dashboard section. Only items that genuinely
 * need the signed-in person are shown; every item explains why it is there,
 * for which organization, and carries a contextual call to action. The data
 * behind these rows is assembled server-side (signature policy, membership
 * queues, requirements checklists) — never from client-side filtering.
 */
export function OfficerActionRequired({ items }: { items: ActionItem[] }) {
  return (
    <Card>
      <CardHeader
        icon={PenLine}
        title="Action required"
        description={
          items.length > 0
            ? `${items.length} ${items.length === 1 ? "item needs" : "items need"} your attention right now.`
            : "Nothing is waiting on you — here is what's happening next."
        }
      />
      {items.length === 0 ? (
        <CardContent>
          <EmptyState
            className="border-0"
            icon={CheckCircle2}
            title="You're all caught up"
            description="No signature, revision, application, or requirement is currently waiting on you."
          />
        </CardContent>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => {
            const meta = KIND_META[item.kind];
            const Icon = meta.icon;
            return (
              <li key={item.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                <span
                  className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${meta.tile}`}
                  aria-hidden
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-content">{item.title}</p>
                  <p className="mt-0.5 text-xs text-content-secondary">
                    {meta.reason}
                    {item.org ? ` · ${item.org}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-content-muted">{item.subtitle}</p>
                </div>
                <Link
                  href={item.href}
                  className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3.5 text-xs font-semibold ${meta.cta}`}
                >
                  {item.cta} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}