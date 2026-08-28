"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";
import { ProportionBar } from "@/components/ui/charts";

export type MatrixTone = "success" | "warning" | "info" | "neutral" | "danger";

export type MatrixRow = {
  orgId: string;
  name: string;
  acronym: string | null;
  college: string | null;
  recognition: string;
  recognitionTone: MatrixTone;
  met: number;
  total: number;
  financial: string;
  financialTone: MatrixTone;
  completion: number | null;
  completionLabel: string;
  risk: string | null;
  riskTone: "danger" | "warning" | "neutral";
  /** Days to the nearest applicable deadline (used for deadline-proximity sort). */
  deadlineIn: number | null;
};

type SortKey = "compliance-desc" | "compliance-asc" | "org" | "college" | "recognition" | "deadline";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "compliance-desc", label: "Lowest compliance first" },
  { key: "compliance-asc", label: "Highest compliance first" },
  { key: "org", label: "Organization (A–Z)" },
  { key: "college", label: "College" },
  { key: "recognition", label: "Recognition status" },
  { key: "deadline", label: "Deadline proximity" },
];

export function ComplianceMatrix({ rows }: { rows: MatrixRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("compliance-desc");

  const sorted = useMemo(() => {
    const pct = (r: MatrixRow) => (r.total > 0 ? r.met / r.total : -1);
    const copy = [...rows];
    switch (sortKey) {
      case "compliance-desc":
        return copy.sort((a, b) => pct(b) - pct(a) || a.name.localeCompare(b.name));
      case "compliance-asc":
        return copy.sort((a, b) => pct(a) - pct(b) || a.name.localeCompare(b.name));
      case "org":
        return copy.sort((a, b) => a.name.localeCompare(b.name));
      case "college":
        return copy.sort((a, b) => (a.college ?? "").localeCompare(b.college ?? ""));
      case "recognition":
        return copy.sort((a, b) => a.recognition.localeCompare(b.recognition));
      case "deadline":
        return copy.sort((a, b) => (a.deadlineIn ?? Infinity) - (b.deadlineIn ?? Infinity));
      default:
        return copy;
    }
  }, [rows, sortKey]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <select
          aria-label="Sort organizations"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-xs font-medium text-content focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-content-muted">
          {rows.length} organization{rows.length === 1 ? "" : "s"} · click an organization for its analytics
        </span>
      </div>

      <TableWrap>
        <THead>
          <TH>Organization</TH>
          <TH>Recognition</TH>
          <TH>Requirements</TH>
          <TH>Financial</TH>
          <TH>Activities</TH>
          <TH>Risk</TH>
        </THead>
        <tbody>
          {sorted.map((r) => (
            <TR key={r.orgId}>
              <TD>
                <Link href={`/analytics/org/${r.orgId}`} className="font-semibold text-content hover:text-primary">
                  {r.acronym ?? r.name}
                </Link>
                <span className="block text-[11px] text-content-secondary">{r.college ?? "—"}</span>
              </TD>
              <TD className="min-w-32">
                <Badge tone={r.recognitionTone}>{r.recognition}</Badge>
              </TD>
              <TD className="min-w-24">
                {r.total > 0 ? (
                  <ProportionBar value={r.met} total={r.total} />
                ) : (
                  <span className="text-xs text-content-muted">No data</span>
                )}
              </TD>
              <TD className="min-w-32">
                <Badge tone={r.financialTone}>{r.financial}</Badge>
              </TD>
              <TD className="min-w-24">
                {r.completion != null ? (
                  <>
                    <span className="font-semibold tabular-nums text-content">{r.completion}%</span>
                    <span className="ml-1 text-[11px] text-content-secondary">{r.completionLabel}</span>
                  </>
                ) : (
                  <span className="text-xs text-content-muted">No data</span>
                )}
              </TD>
              <TD className="min-w-24">
                {r.risk ? (
                  <Badge tone={r.riskTone}>{r.risk}</Badge>
                ) : (
                  <span className="text-xs text-content-muted">—</span>
                )}
              </TD>
            </TR>
          ))}
          {sorted.length === 0 && (
            <TR>
              <td colSpan={6} className="py-8 text-center text-sm text-content-muted">
                No organizations match the current filters.
              </td>
            </TR>
          )}
        </tbody>
      </TableWrap>
    </div>
  );
}