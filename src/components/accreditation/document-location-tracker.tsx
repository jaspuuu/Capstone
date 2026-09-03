"use client";

import { CheckCircle2, Circle, ChevronDown, ChevronRight, UserCheck, UserCircle, Lock, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FORM_META, SIGNATORY_LABELS } from "@/lib/form-routes";
import type { SignatoryRole } from "@/generated/prisma/client";

interface DocumentLocationTrackerProps {
  recognition: {
    status: string;
    kind: "INITIAL" | "RENEWAL";
    signatureRoutes?: {
      formKey: string;
      state: string;
      steps: {
        order: number;
        role: SignatoryRole;
        status: "LOCKED" | "CURRENT" | "SIGNED" | "RETURNED" | "REJECTED" | "SUPERSeded";
        signedAt?: string | null;
        signer?: { firstName: string; lastName: string } | null;
      }[];
    }[];
  };
  requirements: {
    key: string;
    label: string;
    met: boolean;
    status: string;
  }[];
}

const FORM_ROUTES: Record<string, SignatoryRole[]> = {
  SF001: ["PRESIDENT", "SECRETARY", "SENIOR_ADVISER", "DEAN"],
  SF002: ["PRESIDENT", "SENIOR_ADVISER", "DEAN", "SOA", "OSAS"],
  SF003: ["PRESIDENT", "SECRETARY", "SENIOR_ADVISER", "DEAN"],
  SF005: ["PRESIDENT", "SECRETARY", "SENIOR_ADVISER"],
};

function getCurrentStep(steps: any[]): any | null {
  return steps.find((s) => s.status === "CURRENT") ?? steps.find((s) => s.status !== "SIGNED" && s.status !== "LOCKED") ?? null;
}

function getCompletedCount(steps: any[]): number {
  return steps.filter((s) => s.status === "SIGNED").length;
}

function isSuperseded(step: any): boolean {
  return step.status === "SUPERSeded";
}

function getTotalSteps(steps: any[]): number {
  return steps.length;
}

export function DocumentLocationTracker({ recognition, requirements }: DocumentLocationTrackerProps) {
  if (!recognition.signatureRoutes || recognition.signatureRoutes.length === 0) {
    return (
      <div className="text-center py-8 text-content-muted">
        <Circle className="mx-auto size-12 text-line" aria-hidden />
        <p className="mt-3 text-sm">No signature routes started yet.</p>
        <p className="text-xs mt-1">Routes are created when forms are first opened.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {recognition.signatureRoutes.map((route) => {
        const routeRoles = FORM_ROUTES[route.formKey] ?? [];
        const total = getTotalSteps(route.steps);
        const completed = getCompletedCount(route.steps);
        const currentStep = getCurrentStep(route.steps);
        const isComplete = route.state === "COMPLETED";
        const isReturned = route.state === "RETURNED_FOR_REVISION";
        const isRejected = route.state === "REJECTED";

        return (
          <div key={route.formKey} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-content-muted bg-surface-secondary px-2 py-0.5 rounded">
                  {route.formKey}
                </span>
                <span className="text-sm font-medium text-content">{FORM_META[route.formKey as keyof typeof FORM_META]?.title ?? route.formKey}</span>
              </div>
              <Badge tone={isComplete ? "success" : isReturned ? "orange" : isRejected ? "danger" : "warning"}>
                {isComplete ? "Completed" : isReturned ? "Revision Required" : isRejected ? "Rejected" : "In Progress"}
              </Badge>
            </div>

            <div className="space-y-2">
              {routeRoles.map((role, index) => {
                const step = route.steps.find((s) => s.order === index + 1);
                const isSigned = step?.status === "SIGNED";
                const isCurrent = step?.status === "CURRENT";
                const isLocked = step?.status === "LOCKED" || (!isSigned && !isCurrent);
                const isReturned = step?.status === "RETURNED";
                const isRejected = step?.status === "REJECTED";

                let icon: React.ReactNode;
                let connectorClass = "";
                let labelClass = "";

                if (isSigned) {
                  icon = <UserCheck className="size-4 text-success" aria-hidden />;
                  connectorClass = "bg-success";
                  labelClass = "text-success";
                } else if (isCurrent) {
                  icon = <UserCircle className="size-4 text-primary" aria-hidden />;
                  connectorClass = "bg-primary";
                  labelClass = "text-primary font-semibold";
                } else if (isReturned) {
                  icon = <AlertCircle className="size-4 text-warning" aria-hidden />;
                  connectorClass = "bg-warning";
                  labelClass = "text-warning";
                } else if (isRejected) {
                  icon = <AlertCircle className="size-4 text-danger" aria-hidden />;
                  connectorClass = "bg-danger";
                  labelClass = "text-danger";
                } else if (isSuperseded(step)) {
                  icon = <AlertCircle className="size-4 text-orange" aria-hidden />;
                  connectorClass = "bg-orange";
                  labelClass = "text-orange";
                } else {
                  icon = <Lock className="size-4 text-content-muted" aria-hidden />;
                  connectorClass = "bg-line";
                  labelClass = "text-content-muted";
                }

                return (
                  <div key={role} className="flex items-start gap-3 relative">
                    {/* Vertical connector */}
                    <div className="absolute left-5 top-6 bottom-0 w-0.5" style={{ background: connectorClass }} />

                    <div className="flex items-center gap-3 relative z-10">
                      {/* Role badge */}
                      <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${isSigned ? "bg-success/10" : isCurrent ? "bg-primary/10" : isReturned ? "bg-warning/10" : isRejected ? "bg-danger/10" : "bg-line/50"}`}>
                        {icon}
                      </div>

                      {/* Role info */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${labelClass}`}>{SIGNATORY_LABELS[role] ?? role}</p>
                        {step?.signer && (
                          <p className="text-xs text-content-secondary">
                            {step.signer.firstName} {step.signer.lastName}
                            {step.signedAt && <span className="ml-1">· {new Date(step.signedAt).toLocaleDateString()}</span>}
                            {isSuperseded(step) && <span className="text-xs text-orange ml-1">(Superseded)</span>}
                          </p>
                        )}
                        {isCurrent && !step?.signer && (
                          <p className="text-xs text-content-muted">Awaiting assignment</p>
                        )}
                        {isLocked && !isCurrent && !isSigned && (
                          <p className="text-xs text-content-muted">Waiting for previous step</p>
                        )}
                      </div>

                      {/* Status badge */}
                      <div className="shrink-0">
{isSigned && <Badge tone="success" className="text-[10px]">Signed</Badge>}
                      {isCurrent && <Badge tone="primary" className="text-[10px]">Current</Badge>}
                      {isReturned && <Badge tone="orange" className="text-[10px]">Returned</Badge>}
                      {isRejected && <Badge tone="danger" className="text-[10px]">Rejected</Badge>}
                      {isSuperseded(step) && <Badge tone="orange" className="text-[10px]">Superseded</Badge>}
                      {isLocked && !isCurrent && !isSigned && !isReturned && !isRejected && !isSuperseded && (
                        <Badge tone="neutral" className="text-[10px]">Locked</Badge>
                      )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {isReturned && (
              <div className="mt-3 p-3 rounded-lg border border-warning/30 bg-warning-light/40">
                <p className="text-xs font-semibold text-warning">Revision Required</p>
                <p className="text-xs text-content-secondary mt-1">
                  This form was returned for revision. The President must update and resubmit.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
