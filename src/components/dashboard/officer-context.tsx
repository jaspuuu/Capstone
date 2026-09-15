import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/constants";

export type OfficerContextMembership = {
  orgId: string;
  name: string;
  acronym: string | null;
  positionLabel: string;
};

/**
 * CURRENT ORGANIZATION CONTEXT — the single most important answer on the
 * dashboard: which organization the officer is acting for, in what role, for
 * which academic year, and its recognition standing. When the person belongs
 * to several organizations the compact strip makes the alternative contexts
 * visible and clickable — the selected one is marked.
 */
export function OfficerContext({
  orgName,
  orgAcronym,
  orgHref,
  positionLabel,
  ay,
  collegeLabel,
  recognitionLabel,
  recognitionTone,
  recognitionDetail,
  memberships,
  activeOrgId,
}: {
  orgName: string;
  orgAcronym: string | null;
  orgHref: string;
  positionLabel: string;
  ay: string;
  collegeLabel?: string | null;
  recognitionLabel: string;
  recognitionTone: BadgeTone;
  recognitionDetail?: string | null;
  memberships: OfficerContextMembership[];
  activeOrgId: string;
}) {
  const multi = memberships.length > 1;
  return (
    <Card>
      <CardContent className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-content-muted">
              Current organization
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Link href={orgHref} className="font-display text-lg font-bold tracking-tight text-primary hover:underline">
                {orgAcronym ?? orgName}
              </Link>
              <Badge tone={positionLabel === "President" ? "primary" : positionLabel === "Secretary" ? "info" : "neutral"}>
                {positionLabel}
              </Badge>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-content-secondary">
                <Building2 className="size-3.5" aria-hidden /> AY {ay}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-content-secondary">
              {orgName}
              {collegeLabel ? ` · ${collegeLabel}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Badge tone={recognitionTone}>{recognitionLabel}</Badge>
            {recognitionDetail && (
              <span className="text-[11px] text-content-muted">{recognitionDetail}</span>
            )}
          </div>
        </div>

        {multi && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-content-muted">My organizations</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {memberships.map((m) => {
                const active = m.orgId === activeOrgId;
                return (
                  <Link
                    key={m.orgId}
                    href={`/organizations/${m.orgId}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                      active
                        ? "border-primary bg-primary-light/50 text-primary"
                        : "border-line-strong bg-surface-secondary/50 text-content-secondary hover:border-primary hover:text-primary"
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", active ? "bg-primary" : "bg-content-muted")} aria-hidden />
                    {m.acronym ?? m.name}
                    <span className="font-medium text-content-muted">· {m.positionLabel}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-3">
          <Link
            href={orgHref}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            Open organization workspace <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}