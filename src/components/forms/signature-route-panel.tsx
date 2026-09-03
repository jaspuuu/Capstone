"use client";

import { useActionState, useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  Lock,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  Undo2,
  XCircle,
} from "lucide-react";
import type { SignatoryRole, SignatureStepStatus, RouteState } from "@/generated/prisma/client";
import { SIGNATORY_LABELS } from "@/lib/form-routes";
import {
  resubmitRoute,
  returnCurrentStep,
  signCurrentStep,
  type RouteActionState,
} from "@/lib/actions/signature-route";
import type { SignatureChainVerification } from "@/lib/signature-integrity";

// ---------------------------------------------------------------------------
// Document workflow tracker (§7, §27). Shows exactly where a document is:
// green ✓ completed · blue ● current · gray 🔒 locked/awaiting ·
// orange returned · red rejected. Signing requires explicit confirmation.
// ---------------------------------------------------------------------------

export type RouteStepView = {
  id: string;
  order: number;
  role: SignatoryRole;
  status: SignatureStepStatus;
  signerName: string | null;
  signedAt: Date | null;
  comment: string | null;
};

export type RouteView = {
  id: string;
  formKey: string;
  state: RouteState;
  version: number;
  steps: RouteStepView[];
};

const EMPTY: RouteActionState = {};

const STEP_STYLE: Record<SignatureStepStatus, { icon: typeof CheckCircle2; cls: string }> = {
  SIGNED: { icon: CheckCircle2, cls: "text-emerald-600" },
  CURRENT: { icon: CircleDashed, cls: "text-blue-600" },
  LOCKED: { icon: Lock, cls: "text-content-muted opacity-60" },
  RETURNED: { icon: Undo2, cls: "text-orange-500" },
  REJECTED: { icon: XCircle, cls: "text-red-600" },
};

function fmt(d: Date) {
  return d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

export function SignatureRoutePanel({
  route,
  viewerCanSignNow,
  verification,
}: {
  route: RouteView;
  viewerId: string;
  /** Server already verified the viewer is the awaited signatory. */
  viewerCanSignNow: boolean;
  /** Recomputed hash-chain result for the route's signed steps (server-side). */
  verification?: SignatureChainVerification;
}) {
  const [signState, signAction] = useActionState(signCurrentStep, EMPTY);
  const [returnState, returnAction] = useActionState(returnCurrentStep, EMPTY);
  const [resubmitState, resubmitAction] = useActionState(resubmitRoute, EMPTY);
  const [confirming, setConfirming] = useState(false);
  const [returning, setReturning] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [useSavedSig, setUseSavedSig] = useState(false);

  const current = route.steps.find((s) => s.status === "CURRENT");
  const done = route.state === "COMPLETED";

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm font-bold tracking-tight text-content">
          Signature workflow
        </h2>
        <span className="text-xs text-content-secondary">
          Version {route.version} ·{" "}
          {done
            ? "Completed"
            : route.state === "RETURNED_FOR_REVISION"
              ? "Returned for revision"
              : current
                ? `Waiting for ${SIGNATORY_LABELS[current.role]}`
                : "In progress"}
        </span>
      </div>

      {/* Tracker */}
      <ol className="mt-4 space-y-1.5">
        {route.steps.map((s, i) => {
          const { icon: Icon, cls } = STEP_STYLE[s.status];
          return (
            <li key={s.id} className="flex items-start gap-2.5">
              <Icon className={`mt-0.5 size-4 shrink-0 ${cls}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-content">
                  {s.order}. {SIGNATORY_LABELS[s.role]}
                  {s.status === "CURRENT" && (
                    <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                      Current
                    </span>
                  )}
                </p>
                {s.signerName && (
                  <p className="text-xs text-content-secondary">{s.signerName}</p>
                )}
                {s.status === "SIGNED" && s.signedAt && (
                  <p className="text-xs text-emerald-700">Signed {fmt(s.signedAt)}</p>
                )}
                {s.status === "LOCKED" && (
                  <p className="text-xs text-content-muted">Locked — awaiting earlier signatories</p>
                )}
                {s.comment && (
                  <p className="mt-0.5 rounded-md bg-orange-50 px-2 py-1 text-xs text-orange-800">
                    {s.comment}
                  </p>
                )}
                {i < route.steps.length - 1 && (
                  <div aria-hidden className="my-1 ml-[-22px] h-3 w-px bg-line" />
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Signature-chain integrity */}
      {verification && verification.total > 0 && (
        <div
          className={`mt-4 rounded-lg border px-3 py-2.5 ${
            verification.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
          }`}
          role={verification.ok ? undefined : "alert"}
        >
          <div className="flex items-center gap-2">
            {verification.ok ? (
              <ShieldCheck className="size-4 text-emerald-600" aria-hidden />
            ) : (
              <ShieldX className="size-4 text-red-600" aria-hidden />
            )}
            <p className={`text-xs font-bold ${verification.ok ? "text-emerald-800" : "text-red-800"}`}>
              {verification.ok
                ? `Signature chain verified (${verification.verified}/${verification.total} links)`
                : "Signature chain integrity check failed"}
            </p>
          </div>
          {!verification.ok && (
            <ul className="mt-1.5 space-y-0.5">
              {verification.links
                .filter((l) => !l.ok)
                .map((l) => (
                  <li key={l.order} className="text-xs text-red-700">
                    Step {l.order} ({SIGNATORY_LABELS[l.role as SignatoryRole] ?? l.role}): {l.reason}
                  </li>
                ))}
            </ul>
          )}
          <p className="mt-1 text-[11px] leading-snug text-content-secondary">
            Each signature is bound to the previous one with a SHA-256 chain at the moment of signing.
          </p>
        </div>
      )}

      {(signState.error || signState.ok || returnState.error || resubmitState.error || resubmitState.ok) && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            signState.error || returnState.error || resubmitState.error
              ? "bg-red-50 text-red-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
          role="alert"
        >
          {signState.error || returnState.error || resubmitState.error ||
            signState.ok || resubmitState.ok}
        </p>
      )}

      {/* Actions */}
      {viewerCanSignNow && current && !done && route.state !== "RETURNED_FOR_REVISION" && (
        <div className="mt-4 border-t border-line pt-4">
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              Attach my signature
            </button>
          ) : (
            <form action={signAction} className="space-y-3">
              <input type="hidden" name="routeId" value={route.id} />
              <input type="hidden" name="confirm" value="yes" />
              <input type="hidden" name="confirmReview" value={reviewed ? "yes" : ""} />
              <input type="hidden" name="useSavedSignature" value={useSavedSig ? "true" : ""} />

              <p className="text-sm font-semibold text-content">
                Signing this document requires two explicit confirmations:
              </p>

              {/* Step 1: Must review document */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-line-strong text-primary focus:ring-primary/20"
                />
                <span className="text-sm text-content">
                  I have reviewed this document and confirm its contents are correct.
                </span>
              </label>

              {/* Step 2: Opt into attaching the saved signature */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useSavedSig}
                  onChange={(e) => setUseSavedSig(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-line-strong text-primary focus:ring-primary/20"
                />
                <span className="text-sm text-content">
                  Attach my saved signature to this document
                </span>
              </label>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!reviewed || !useSavedSig}
                  className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirm &amp; Sign
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirming(false); setReviewed(false); setUseSavedSig(false); }}
                  className="h-9 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content hover:border-primary"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          {!returning ? (
            <button
              onClick={() => setReturning(true)}
              className="ml-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm font-semibold text-orange-600 hover:border-orange-400"
            >
              <Undo2 className="size-3.5" aria-hidden />
              Return for revision
            </button>
          ) : (
            <form action={returnAction} className="ml-2 mt-2 inline-flex flex-wrap items-center gap-2">
              <input type="hidden" name="routeId" value={route.id} />
              <input
                name="comment"
                placeholder="Reason for returning…"
                className="h-9 w-64 rounded-lg border border-line-strong px-3 text-sm"
                required
              />
              <button
                type="submit"
                className="h-9 rounded-lg bg-orange-500 px-3 text-sm font-semibold text-white hover:bg-orange-600"
              >
                Return
              </button>
              <button
                type="button"
                onClick={() => setReturning(false)}
                className="h-9 rounded-lg border border-line-strong px-3 text-sm"
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      )}

      {viewerCanSignNow && route.state === "RETURNED_FOR_REVISION" && (
        <form action={resubmitAction} className="mt-4 border-t border-line pt-4">
          <input type="hidden" name="routeId" value={route.id} />
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Resubmit for signatures
          </button>
        </form>
      )}
    </div>
  );
}
