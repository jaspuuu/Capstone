"use client";

import { CheckCircle2, CircleDashed, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/action-form";
import { submitRecognition } from "@/lib/actions/recognition";
import { REQUIREMENT_STATUS_META } from "@/lib/constants";
import { requirementFormRoute } from "@/lib/form-routes";

interface SubmissionValidationGateProps {
  recognition: {
    id: string;
    status: string;
    kind: "INITIAL" | "RENEWAL";
    signatureRoutes?: {
      formKey: string;
      state: string;
      steps: {
        order: number;
        role: string;
        status: "LOCKED" | "CURRENT" | "SIGNED" | "RETURNED" | "REJECTED";
        signedAt?: string | null;
        signer?: { firstName: string; lastName: string } | null;
      }[];
    }[];
  };
  requirements: {
    key: string;
    label: string;
    met: boolean;
    filed: boolean;
    conditional?: boolean;
    status: "REQUIRED" | "UPLOADED" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "RETURNED";
  }[];
  organizationId: string;
  academicYear: string;
}

export function SubmissionValidationGate({ recognition, requirements, organizationId, academicYear }: SubmissionValidationGateProps) {
  // Readiness is driven by "on file", not approval: a filed but pending item
  // lets the packet be submitted (it only counts as Completed once approved).
  const missingReqs = requirements.filter((r) => !r.filed && !r.conditional);
  const filedRequired = requirements.filter((r) => !r.conditional && r.filed).length;
  const totalRequired = requirements.filter((r) => !r.conditional).length;
  const conditionalPending = requirements.filter((r) => !r.filed && r.conditional);
  const returnedReqs = requirements.filter((r) => r.status === "RETURNED");

  const allSteps = recognition.signatureRoutes?.flatMap((r) => r.steps) ?? [];
  const totalSteps = allSteps.length;
  const signedSteps = allSteps.filter((s) => s.status === "SIGNED").length;
  const chainOk = totalSteps > 0 ? signedSteps === totalSteps : true;

  const canSubmit = missingReqs.length === 0 && recognition.status === "DRAFT" && chainOk;
  const canResubmit = missingReqs.length === 0 && recognition.status === "RETURNED" && chainOk;

  return (
    <div className="space-y-4">
      {/* Validation Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={`p-3 rounded-lg ${missingReqs.length === 0 ? "bg-success/10 border border-success/30" : "bg-danger/10 border border-danger/30"}`}>
          <div className="flex items-center gap-2">
            {missingReqs.length === 0 ? (
              <CheckCircle2 className="size-5 text-success" aria-hidden />
            ) : (
              <AlertCircle className="size-5 text-danger" aria-hidden />
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Required Documents</p>
              <p className={`font-display text-xl font-bold ${missingReqs.length === 0 ? "text-success" : "text-danger"}`}>
                {filedRequired} / {totalRequired}
              </p>
            </div>
          </div>
          {missingReqs.length > 0 && (
            <p className="mt-2 text-xs text-danger">Submission blocked — complete all required items above.</p>
          )}
        </div>

        <div className={`p-3 rounded-lg ${returnedReqs.length === 0 ? "bg-success/10 border border-success/30" : "bg-warning/10 border border-warning/30"}`}>
          <div className="flex items-center gap-2">
            {returnedReqs.length === 0 ? (
              <CheckCircle2 className="size-5 text-success" aria-hidden />
            ) : (
              <AlertCircle className="size-5 text-warning" aria-hidden />
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Revisions Needed</p>
              <p className={`font-display text-xl font-bold ${returnedReqs.length === 0 ? "text-success" : "text-warning"}`}>
                {returnedReqs.length}
              </p>
            </div>
          </div>
          {returnedReqs.length > 0 && (
            <p className="mt-2 text-xs text-warning">Replace returned items before submitting.</p>
          )}
        </div>

        <div className={`p-3 rounded-lg ${conditionalPending.length === 0 ? "bg-success/10 border border-success/30" : "bg-primary/10 border border-primary/30"}`}>
          <div className="flex items-center gap-2">
            {conditionalPending.length === 0 ? (
              <CheckCircle2 className="size-5 text-success" aria-hidden />
            ) : (
              <CircleDashed className="size-5 text-primary" aria-hidden />
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Conditional</p>
              <p className={`font-display text-xl font-bold ${conditionalPending.length === 0 ? "text-success" : "text-primary"}`}>
                {conditionalPending.length === 0 ? "Met" : `${conditionalPending.length} pending`}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-content-secondary">
            Conditional items (Financial Report) do not block submission.
          </p>
        </div>
        <div className={`p-3 rounded-lg ${chainOk ? "bg-success/10 border border-success/30" : "bg-danger/10 border border-danger/30"}`}>
          <div className="flex items-center gap-2">
            {chainOk ? (
              <CheckCircle2 className="size-5 text-success" aria-hidden />
            ) : (
              <AlertCircle className="size-5 text-danger" aria-hidden />
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">Signature Chain</p>
              <p className={`font-display text-xl font-bold ${chainOk ? "text-success" : "text-danger"}`}>
                {chainOk ? "Complete" : `${totalSteps - signedSteps} of ${totalSteps} steps pending`}
              </p>
            </div>
          </div>
          {totalSteps > 0 && !chainOk && (
            <p className="mt-2 text-xs text-danger">
              All signatories must sign before submission.
            </p>
          )}
        </div>
      </div>

      {/* Missing Required Items Detail */}
      {missingReqs.length > 0 && (
        <Card className="border-danger/30 bg-danger-light/20">
          <div className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-danger mb-2">
              Complete These Required Items
            </p>
            <ul className="space-y-2">
              {missingReqs.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CircleDashed className="size-4 text-content-muted" aria-hidden />
                    <span className="font-medium text-content">{item.label}</span>
                    <Badge tone={REQUIREMENT_STATUS_META[item.status].tone}>
                      {REQUIREMENT_STATUS_META[item.status].label}
                    </Badge>
                  </div>
                  <a
                    href={requirementFormRoute(item.key, organizationId, academicYear, recognition.kind)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Complete
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {/* Returned Items Detail */}
      {returnedReqs.length > 0 && (
        <Card className="border-warning/30 bg-warning-light/20">
          <div className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-warning mb-2">
              Items Returned for Revision
            </p>
            <ul className="space-y-2">
              {returnedReqs.map((item) => (
                <li key={item.key} className="flex items-center gap-2 text-sm">
                  <AlertCircle className="size-4 text-warning" aria-hidden />
                  <span className="font-medium text-content">{item.label}</span>
                  <Badge tone="orange">Correction Needed</Badge>
                  <a
                    href={requirementFormRoute(item.key, organizationId, academicYear, recognition.kind)}
                    className="ml-auto text-xs font-semibold text-primary hover:underline"
                  >
                    Replace Document
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {/* Submit Button */}
      <div className="flex items-center gap-3 border-t border-line pt-4">
        <ActionForm action={submitRecognition} submitLabel={canResubmit ? "Resubmit Application" : "Submit Application"} variant="primary" footerClassName="mt-0">
          <input type="hidden" name="id" value={recognition.id} />
          <SubmitButton disabled={!canSubmit && !canResubmit} pendingLabel="Submitting…">
            {canResubmit ? "Resubmit Application" : "Submit Application"}
          </SubmitButton>
        </ActionForm>
        {(!canSubmit && !canResubmit) && (
          <p className="text-xs text-content-muted">
            {missingReqs.length > 0
              ? `Complete ${missingReqs.length} required item${missingReqs.length > 1 ? "s" : ""} first`
              : returnedReqs.length > 0
              ? "Address returned items first"
              : "Ready to submit"}
          </p>
        )}
      </div>
    </div>
  );
}