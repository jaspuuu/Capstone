import Link from "next/link";
import {
  ArrowRight,
  Clock,
  FileSignature,
  Inbox,
  PenLine,
  Stamp,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge, Chip } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SIGNATORY_LABELS } from "@/lib/form-routes";
import { timeAgo } from "@/lib/utils";
import type { SignatureQueueItem } from "@/lib/signature-queue";

const ABSOLUTE = {
  month: "short",
  day: "numeric",
  year: "numeric",
} as const;

/**
 * Office signature queue card — every document currently waiting on an
 * SOA/OSAS signatory step, with a contextual link to the live form page.
 * Rows carry their position in the signature chain and how long the office
 * has been waiting (never color alone).
 */
export function SignatureQueueCard({
  items,
  total = items.length,
  title = "Signature queue",
  viewAllHref = "/signatures",
  compact = false,
}: {
  items: SignatureQueueItem[];
  total?: number;
  title?: string;
  viewAllHref?: string;
  compact?: boolean;
}) {
  const groups = compact
    ? [{ office: "ALL" as const, label: "Awaiting office action", items }]
    : [
        { office: "OSAS" as const, label: "Awaiting OSAS", items: items.filter((i) => i.requiredRole === "OSAS") },
        { office: "SOA" as const, label: "Awaiting SOA", items: items.filter((i) => i.requiredRole === "SOA") },
      ].filter((g) => g.items.length > 0);

  return (
    <Card>
      <CardHeader
        icon={Stamp}
        title={title}
        description={`Documents awaiting an office signature · AY ${items[0]?.ay ?? "—"}`}
        actions={
          total > items.length ? (
            <Link href={viewAllHref} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              View all {total} <span aria-hidden>→</span>
            </Link>
          ) : undefined
        }
      />
      <CardContent className="space-y-5">
        {items.length === 0 ? (
          <EmptyState
            className="border-0"
            icon={Inbox}
            title="Nothing awaiting this office"
            description="No signature-routed document is currently waiting on your office’s signatory step."
          />
        ) : (
          groups.map((group) => (
            <div key={group.office}>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content-secondary">
                <span className={`flex size-5 items-center justify-center rounded-md ${group.office === "OSAS" ? "bg-info/10 text-info" : "bg-gold/10 text-gold-dark"}`}>
                  {group.office === "OSAS" ? <PenLine className="size-3" aria-hidden /> : <Stamp className="size-3" aria-hidden />}
                </span>
                {group.label}
                <span className="text-content-muted">({group.items.length})</span>
              </h4>
              <div className="mt-2 space-y-2">
                {group.items.slice(0, compact ? 5 : undefined).map((item) => (
                  <div
                    key={item.routeId}
                    className="flex items-start gap-3 rounded-lg border border-line bg-surface-secondary/50 p-3"
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold" aria-hidden>
                      <FileSignature className="size-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-semibold text-content">
                          {item.formCode} · {item.documentTitle}
                        </p>
                        <Badge tone="warning" icon={false}>
                          <PenLine className="size-3" aria-hidden /> Pending signature
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-content-secondary">
                        {item.orgAcronym ? `${item.orgName} (${item.orgAcronym})` : item.orgName}
                        {item.version > 1 ? ` · v${item.version}` : ""} · AY {item.ay}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-content-muted">
                        <span>
                          {SIGNATORY_LABELS[item.requiredRole] ?? item.requiredRole} · step {item.stepNumber} of {item.stepCount}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" aria-hidden /> Awaiting {timeAgo(item.awaitedSince)}
                          <span className="text-content-muted/70">
                            ({item.awaitedSince.toLocaleDateString("en-PH", ABSOLUTE)})
                          </span>
                        </span>
                      </p>
                    </div>

                    <Link
                      href={item.href}
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover"
                    >
                      Review & sign <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}