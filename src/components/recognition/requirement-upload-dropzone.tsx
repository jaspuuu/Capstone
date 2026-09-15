"use client";

import { useActionState, useRef, useState } from "react";
import { UploadCloud, FileText, X, AlertCircle, Trash2 } from "lucide-react";
import { uploadAttachment, deleteAttachment } from "@/lib/actions/attachments";
import type { ActionState } from "@/lib/actions/attachments";
import type { AttachmentKind } from "@/lib/attachment-types";
import { SubmitButton } from "@/components/ui/submit-button";
import { QuickActionForm } from "@/components/action-form";

const ACCEPT = ".pdf,.docx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_BYTES = 10 * 1024 * 1024;

export function RequirementUploadDropzone({
  entityId,
  kind,
  existing,
}: {
  entityId: string;
  kind: AttachmentKind;
  existing?: {
    id: string;
    fileName: string;
    sizeBytes: number;
    notes: string | null;
    uploadedByName?: string | null;
  } | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(uploadAttachment, {});
  const [selected, setSelected] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (!ACCEPT.includes(f.type) && f.type !== "") {
      setSelected(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setSelected(null);
      return;
    }
    setSelected(f);
  }

  const showUpload = !existing || replacing;

  return (
    <div>
      {existing && !replacing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-secondary/60 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
              <FileText className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <a
                href={`/attachments/${existing.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-sm font-semibold text-content hover:text-primary"
              >
                {existing.fileName}
              </a>
              <p className="text-xs text-content-secondary">
                {(existing.sizeBytes / 1024).toFixed(0)} KB
                {existing.uploadedByName ? ` · ${existing.uploadedByName}` : ""}
              </p>
              {existing.notes && (
                <p className="mt-0.5 text-xs italic text-content-muted">&ldquo;{existing.notes}&rdquo;</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`/attachments/${existing.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-content hover:border-primary hover:text-primary"
            >
              View
            </a>
            <button
              type="button"
              onClick={() => setReplacing(true)}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover"
            >
              Replace
            </button>
            <QuickActionForm
              action={deleteAttachment}
              hidden={{ id: existing.id }}
              label=""
              confirmMessage={`Remove “${existing.fileName}”? This cannot be undone.`}
              variant="ghost"
            >
              <Trash2 className="size-4" aria-hidden />
            </QuickActionForm>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="space-y-3">
          {state.error && (
            <p className="flex items-center gap-1.5 rounded-lg bg-danger-light px-3 py-2 text-xs font-medium text-danger">
              <AlertCircle className="size-3.5" aria-hidden /> {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-lg bg-success-light px-3 py-2 text-xs font-medium text-success">{state.success}</p>
          )}
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="entityType" value="Recognition" />
            <input type="hidden" name="entityId" value={entityId} />
            <input type="hidden" name="kind" value={kind} />

            <input
              ref={inputRef}
              type="file"
              name="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0])}
            />

            {!selected ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pick(e.dataTransfer.files?.[0]);
                }}
                className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  dragging ? "border-primary bg-primary/5" : "border-line-strong bg-surface hover:border-primary/50"
                }`}
              >
                <span className="rounded-lg bg-primary/10 p-2.5">
                  <UploadCloud className="size-5 text-primary" aria-hidden />
                </span>
                <span className="text-sm font-semibold text-content">
                  Drag &amp; drop your document here, or <span className="text-primary underline">browse</span>
                </span>
                <span className="text-xs text-content-muted">PDF, Word (.docx), or Excel (.xlsx) up to 10 MB</span>
              </button>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-line-strong bg-surface px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileText className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="truncate text-sm font-medium text-content">{selected.name}</span>
                  <span className="shrink-0 text-xs text-content-muted">{(selected.size / 1024).toFixed(0)} KB</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  className="shrink-0 text-content-muted hover:text-danger"
                  aria-label="Remove selected file"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-content-secondary">Remarks (optional)</span>
              <textarea
                name="notes"
                rows={2}
                maxLength={500}
                placeholder="e.g. Latest amended constitution approved by the general assembly on…"
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-content placeholder:text-content-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton
                variant="primary"
                pendingLabel="Uploading…"
                disabled={!selected}
              >
                {existing ? "Replace document" : "Upload document"}
              </SubmitButton>
              {existing && (
                <button
                  type="button"
                  onClick={() => {
                    setReplacing(false);
                    setSelected(null);
                  }}
                  className="text-xs font-semibold text-content-muted hover:text-content"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}