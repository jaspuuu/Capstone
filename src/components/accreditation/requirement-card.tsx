"use client";

import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  Clock,
  AlertCircle,
  ArrowRight,
  FileText,
  UploadCloud,
  RefreshCw,
  Eye,
  ShieldCheck,
  PenLine,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requirementFormRoute, isDocumentRequirement } from "@/lib/form-routes";
import type { RequirementItem } from "@/lib/analytics";

type RequirementCardProps = {
  item: RequirementItem;
  organizationId: string;
  academicYear: string;
  /** Which SF form drives this requirement's signature chain (if any). */
  formKey?: string;
  /** Signature-chain progress of the application packet (SF-001/SF-002). */
  chainSummary?: { completed: number; total: number } | null;
  lastUpdated?: string | null;
  /** INITIAL or RENEWAL — picks the ISO letter form (SF-001 vs SF-002). */
  recognitionKind?: "INITIAL" | "RENEWAL";
};

const ACTION_TEXT: Record<string, string> = {
  APPLICATION_LETTER: "Open Form",
  CONSTITUTION: "Upload Document",
  PLAN_OF_ACTIVITIES: "Open Form",
  ACCOMPLISHMENT_REPORTS: "Upload Document",
  ADVISER_COMMITMENT: "Open Form",
  CERTIFICATION: "Open Form",
  FINANCIAL_REPORT: "Upload Document",
  SUPPORTING_DOCUMENTS: "Upload Document",
};

const ACTION_HINTS: Record<string, string> = {
  APPLICATION_LETTER: "Application/Renewal Letter to OSAS",
  CONSTITUTION: "Upload the organization's governing document",
  PLAN_OF_ACTIVITIES: "Complete the plan for the current school year",
  ACCOMPLISHMENT_REPORTS: "File reports from the previous cycle",
  ADVISER_COMMITMENT: "Adviser countersignature required",
  CERTIFICATION: "Awaiting Dean signature",
  FINANCIAL_REPORT: "Required only if the organization has financial activity",
  SUPPORTING_DOCUMENTS: "Supplementary evidence to accompany the application",
};

export function RequirementCard({ item, organizationId, academicYear, chainSummary, lastUpdated, recognitionKind }: RequirementCardProps) {
  const isConditional = item.conditional;
  const isDoc = isDocumentRequirement(item.key);
  const isMet = item.met;
  const needsAction = !isMet && !isConditional;
  const inProgress = !isMet && !isConditional && ["SUBMITTED", "UNDER_REVIEW", "UPLOADED"].includes(item.status);

  // Document requirements read Upload / Replace / View; SF forms keep Open Form.
  let actionLabel: string;
  if (item.status === "RETURNED" && item.filed) {
    actionLabel = "Replace Document";
  } else if (isDoc) {
    actionLabel = item.filed ? "View Document" : "Upload Document";
  } else {
    actionLabel = item.status === "RETURNED" ? "Revise" : (ACTION_TEXT[item.key] ?? "Open");
  }
  const href = requirementFormRoute(item.key, organizationId, academicYear, recognitionKind);

  let statusBadge: React.ReactNode;
  if (item.status === "APPROVED") {
    statusBadge = <Badge tone="success">Completed</Badge>;
  } else if (item.status === "RETURNED") {
    statusBadge = <Badge tone="orange">Needs Revision</Badge>;
  } else if (item.status === "UNDER_REVIEW") {
    statusBadge = <Badge tone="warning">Under Review</Badge>;
  } else if (item.status === "SUBMITTED") {
    statusBadge = <Badge tone="info">Submitted</Badge>;
  } else if (item.status === "UPLOADED") {
    statusBadge = <Badge tone="primary">Uploaded</Badge>;
  } else {
    statusBadge = <Badge tone="neutral">{isConditional ? "Optional" : "Required"}</Badge>;
  }

  let actionIcon: React.ReactNode;
  if (item.status === "RETURNED" && item.filed) {
    actionIcon = <RefreshCw className="size-3.5" aria-hidden />;
  } else if (isDoc) {
    actionIcon = item.filed ? <Eye className="size-3.5" aria-hidden /> : <UploadCloud className="size-3.5" aria-hidden />;
  } else {
    actionIcon = <FileText className="size-3.5" aria-hidden />;
  }

  return (
    <div
      className={`rounded-xl border bg-surface p-4 transition-colors ${
        needsAction ? "border-line-strong" : isMet ? "border-line" : "border-warning/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: icon + status chip */}
        <div className={`mt-0.5 rounded-lg p-2 ${needsAction ? "bg-warning/10" : isMet ? "bg-success/10" : "bg-primary/10"}`}>
          {isMet ? (
            <CheckCircle2 className="size-5 text-success" aria-hidden />
          ) : item.status === "RETURNED" ? (
            <AlertCircle className="size-5 text-warning" aria-hidden />
          ) : needsAction ? (
            <AlertCircle className="size-5 text-warning" aria-hidden />
          ) : inProgress || item.status === "UPLOADED" ? (
            <Clock className="size-5 text-primary" aria-hidden />
          ) : (
            <CircleDashed className="size-5 text-content-muted" aria-hidden />
          )}
        </div>

        {/* Center: name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-content">{item.label}</p>
            {statusBadge}
          </div>
          <p className="mt-1 text-xs text-content-secondary">{ACTION_HINTS[item.key] ?? "Complete this requirement."}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-content-muted">
            {isConditional && (
              <span className="inline-flex items-center gap-1">
                <CircleDashed className="size-3" aria-hidden /> Conditional (if any)
              </span>
            )}
            {!isConditional && (
              <span className="inline-flex items-center gap-1 font-medium text-content-secondary">
                <ShieldCheck className="size-3" aria-hidden /> Required
              </span>
            )}
            {chainSummary && chainSummary.total > 0 && (
              <span className="inline-flex items-center gap-1">
                <PenLine className="size-3" aria-hidden />
                Signature chain {chainSummary.completed}/{chainSummary.total}
              </span>
            )}
            {item.filed && (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="size-3 text-success" aria-hidden />
                {isMet ? "Approved" : "On file"}
              </span>
            )}
            {lastUpdated && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden /> Updated {lastUpdated}
              </span>
            )}
          </div>
        </div>

        {/* Right: action */}
        <Link
          href={href}
          className="shrink-0 inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors bg-primary text-white hover:bg-primary-hover"
        >
          {actionIcon}
          {actionLabel}
          <ArrowRight className="size-3" aria-hidden />
        </Link>
      </div>
    </div>
  );
}