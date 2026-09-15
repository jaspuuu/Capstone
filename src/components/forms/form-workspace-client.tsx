"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileEdit,
  History,
  PenLine,
  Send,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { PdfPreview } from "@/components/forms/pdf-preview";
import { PdfFieldPreview } from "@/components/forms/pdf-field-preview";
import { FormFieldsEditor } from "@/components/forms/form-fields-editor";
import { DocumentStatusBar, type FormLifecycle } from "@/components/forms/document-status-bar";
import {
  submitFormDocument,
  type FormDraftActionState,
} from "@/lib/actions/form-draft";
import type { FormDraftData } from "@/lib/form-draft-data";

const EMPTY: FormDraftActionState = {};

export type FormVersionEvent = {
  id: string;
  version: number;
  label: string;
  note?: string;
  timestamp: string; // ISO
  kind: "draft" | "submit" | "signature";
};

/**
 * Three-mode form workspace shell:
 *   1. Preview – the official document rendered exactly as issued.
 *   2. Edit    – the official document stays visible; ONLY the legitimate
 *                variable fields are listed beside it as overrides.
 *   3. Signature – "Review & Sign" scrolls to the workflow panel; the sign/
 *                return/resubmit actions stay backend-enforced.
 * The DOCX template is never rebuilt — data + signature → official DOCX → PDF.
 */
export function FormWorkspaceClient({
  formKey,
  orgId,
  ay,
  backHref,
  code,
  formTitle,
  orgDisplayName,
  docxHref,
  pdfHref,
  lifecycle,
  canEdit,
  canSubmit,
  viewerCanSignNow,
  draft,
  draftVersion,
  versions,
  signatureSection,
}: {
  formKey: string;
  orgId: string;
  ay: string;
  backHref: string;
  code: string;
  formTitle: string;
  orgDisplayName: string;
  docxHref: string;
  pdfHref: string;
  lifecycle: FormLifecycle;
  canEdit: boolean;
  canSubmit: boolean;
  viewerCanSignNow: boolean;
  draft: FormDraftData;
  draftVersion: number;
  versions: FormVersionEvent[];
  /** Server-rendered signature workflow panel (kept as a server component). */
  signatureSection: ReactNode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [showHistory, setShowHistory] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [submitState, submitAction] = useActionState(submitFormDocument, EMPTY);
  const sigRef = useRef<HTMLDivElement | null>(null);

  // After a successful submit, pull the refreshed server props (lifecycle,
  // draft state, version cache-buster) so the page reflects the new status.
  useEffect(() => {
    if (submitState.ok) router.refresh();
  }, [submitState.ok, router]);

  const goSign = () => {
    setMode("preview");
    requestAnimationFrame(() => {
      sigRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <main className="min-h-dvh bg-surface-secondary">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Toolbar */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-content-secondary hover:border-line-strong hover:text-content"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Back
            </Link>
            <div>
              <h1 className="font-display text-lg font-bold tracking-tight text-content">
                {code} · {formTitle}
              </h1>
              <p className="text-xs text-content-muted">{orgDisplayName} · AY {ay}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit &&
              (mode === "preview" ? (
                <button
                  type="button"
                  onClick={() => {
                  setMode("edit");
                  setActiveField(null);
                }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-content-secondary hover:border-line-strong hover:text-content"
                >
                  <PenLine className="size-3.5" aria-hidden />
                  Edit Form
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                  setMode("preview");
                  setActiveField(null);
                }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-content-secondary hover:border-line-strong hover:text-content"
                >
                  <X className="size-3.5" aria-hidden />
                  Cancel Edit
                </button>
              ))}
            {canSubmit && (
              <form action={submitAction}>
                <input type="hidden" name="formKey" value={formKey} />
                <input type="hidden" name="organizationId" value={orgId} />
                <input type="hidden" name="academicYear" value={ay} />
                <button
                  type="submit"
                  disabled={mode === "edit"}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white shadow-card hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="size-3.5" aria-hidden />
                  Submit
                </button>
              </form>
            )}
            <button
              type="button"
              onClick={goSign}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
                viewerCanSignNow
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  : "border-line bg-surface text-content-secondary hover:border-line-strong hover:text-content"
              }`}
            >
              <FileEdit className="size-3.5" aria-hidden />
              {viewerCanSignNow ? "Review & Sign" : "Review workflow"}
            </button>
            <a
              href={pdfHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-content-secondary hover:border-line-strong hover:text-content"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              Open PDF
            </a>
            <a
              href={docxHref}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white shadow-card hover:bg-primary-strong"
            >
              <Download className="size-3.5" aria-hidden />
              Download DOCX
            </a>
          </div>
        </header>

        {(submitState.error || submitState.ok) && (
          <p
            role="alert"
            className={`mt-3 rounded-lg px-3 py-2 text-xs ${
              submitState.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {submitState.error ?? submitState.ok}
          </p>
        )}

        {/* Status bar + version history toggle */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3">
          <DocumentStatusBar lifecycle={lifecycle} />
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-content-muted hover:text-content"
          >
            <History className="size-3.5" aria-hidden />
            Version history
          </button>
        </div>

        {showHistory && (
          <section className="mt-2 rounded-xl border border-line bg-surface px-4 py-3">
            <h2 className="font-display text-sm font-bold tracking-tight text-content">
              Version history
            </h2>
            <ol className="mt-2 space-y-2">
              {versions.length === 0 && (
                <li className="text-xs text-content-muted">
                  No recorded versions yet — save a draft to start one.
                </li>
              )}
              {[...versions]
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                .reverse()
                .map((v) => (
                  <li key={v.id} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 shrink-0 rounded bg-surface-secondary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-content-secondary">
                      v{v.version}
                    </span>
                    <span className="text-content">{v.label}</span>
                    {v.note && <span className="text-content-muted">— {v.note}</span>}
                    <span className="ml-auto shrink-0 text-content-muted">
                      {new Date(v.timestamp).toLocaleString("en-PH", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </li>
                ))}
            </ol>
          </section>
        )}

        {/* The document itself */}
        <section className="mt-4 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-content">Official form</p>
            <span className="text-xs text-content-muted">
              {lifecycle.label}
              {draftVersion > 0 ? ` · draft v${draftVersion}` : ""}
            </span>
          </div>

          {mode === "edit" && canEdit ? (
            <div className="grid gap-0 lg:grid-cols-[1fr_300px]">
              <div className="relative min-h-[540px]">
                <div className="absolute inset-0 z-10 flex items-start justify-center rounded-t-xl bg-surface-secondary/40 pt-3 lg:rounded-none">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-800">
                    <PenLine className="size-3" aria-hidden />
                    Editable variable fields — the official layout never changes
                  </span>
                </div>
                <PdfFieldPreview
                  formKey={formKey}
                  pdfHref={pdfHref}
                  docxHref={docxHref}
                  label={code}
                  activeField={activeField}
                  onSelectField={setActiveField}
                />
              </div>
              <aside className="border-t border-line p-4 lg:border-l lg:border-t-0">
                <h2 className="font-display text-sm font-bold tracking-tight text-content">
                  Editable fields
                </h2>
                <p className="mt-0.5 text-[11px] leading-snug text-content-muted">
                  Change only values that vary per document. Everything else comes from the
                  organization record and the official template.
                </p>
                <div className="mt-3">
                  <FormFieldsEditor
                    formKey={formKey}
                    organizationId={orgId}
                    academicYear={ay}
                    initial={draft}
                    activeField={activeField}
                    onActiveField={setActiveField}
                  />
                </div>
              </aside>
            </div>
          ) : (
            <div>
              <PdfPreview pdfHref={pdfHref} docxHref={docxHref} label={code} />
            </div>
          )}
        </section>

        {/* Signature workflow (server-rendered panel is slotted here) */}
        <div ref={sigRef} className="mt-4 scroll-mt-4">
          {signatureSection}
        </div>

        <p className="mt-3 text-xs text-content-muted">
          This preview renders the populated official document for on-screen review.
          When a server-side renderer (Microsoft Word) is available, a PDF is shown;
          otherwise the DOCX is rendered in your browser. The downloaded DOCX is the
          official document — review it in Office before submitting.
        </p>
      </div>
    </main>
  );
}