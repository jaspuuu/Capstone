"use client";

import { CheckCircle2, Circle, CircleDot, RotateCcw, XCircle } from "lucide-react";

/**
 * Five-stage document lifecycle bar (screen-only chrome — never part of the
 * official sheet): Draft → Submitted → For Signature → Revision → Approved.
 *
 * Semantics:
 *   ✓ completed · ● current · ○ not reached yet
 *
 * Workflow status and signature status are SEPARATE concerns. "For Signature"
 * is the active stage whenever signatures are still being gathered; the
 * signatureProgress hint below it shows "n of m signatures completed". A
 * document only ever shows APPROVED when every configured required signature
 * is complete (decided upstream, in the server shell).
 *
 * Rejected renders as a red terminal state.
 */
export type FormLifecycle = {
  stage: 0 | 1 | 2 | 3 | 4;
  label: string;
  rejected?: boolean;
  /** Signature status, independent of the workflow stage. */
  signatureProgress?: { signed: number; total: number };
};

const STAGES = ["Draft", "Submitted", "For Signature", "Revision", "Approved"];

export function DocumentStatusBar({ lifecycle }: { lifecycle: FormLifecycle }) {
  const { signed, total } = lifecycle.signatureProgress ?? { signed: 0, total: 0 };
  const pct = total > 0 ? Math.round((signed / total) * 100) : 0;
  const colors =
    lifecycle.stage > 0 && !lifecycle.rejected
      ? "bg-emerald-600 text-white"
      : lifecycle.rejected && lifecycle.stage >= 4
        ? "bg-red-600 text-white"
        : "bg-surface-secondary text-content-muted";
  return (
    <div role="status" aria-label={`Document status: ${lifecycle.label}`}>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {STAGES.map((stage, i) => {
          const active = i === lifecycle.stage;
          const passed = i < lifecycle.stage;
          const isTerminal = i === 4;
          return (
            <div key={stage} className="flex items-center">
              {i > 0 && (
                <span
                  className={`mx-1 h-px w-5 ${
                    passed && !lifecycle.rejected ? "bg-emerald-500" : "bg-line-strong"
                  }`}
                  aria-hidden
                />
              )}
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  active
                    ? colors
                    : passed && !lifecycle.rejected
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : lifecycle.rejected && isTerminal
                        ? "border-white/40 text-white bg-red-600/80"
                        : "border-line bg-surface text-content-muted"
                }`}
              >
                {active && lifecycle.rejected && isTerminal ? (
                  <XCircle className="size-3" aria-hidden />
                ) : active && stage === "Revision" ? (
                  <RotateCcw className="size-3" aria-hidden />
                ) : active && isTerminal ? (
                  <CheckCircle2 className="size-3" aria-hidden />
                ) : active ? (
                  <CircleDot className="size-3" aria-hidden />
                ) : passed && !lifecycle.rejected ? (
                  <CheckCircle2 className="size-3" aria-hidden />
                ) : (
                  <Circle className="size-3" aria-hidden />
                )}
                {stage}
              </span>
            </div>
          );
        })}
      </div>

      {/* Signature status — only meaningful while signatures are being gathered. */}
      {total > 0 && !lifecycle.rejected && lifecycle.stage > 0 && lifecycle.stage < 4 && (
        <p className="mt-1.5 text-[11px] font-medium text-content-secondary">
          {lifecycle.label} — {signed} of {total} signatures completed
          <span aria-hidden className="ml-2 inline-flex h-1 w-28 overflow-hidden rounded-full bg-line-strong align-middle">
            <span
              className={`h-full rounded-full ${
                signed === total ? "bg-emerald-500" : "bg-blue-500"
              }`}
              style={{ width: `${pct}%` }}
              aria-hidden
            />
          </span>
        </p>
      )}
    </div>
  );
}