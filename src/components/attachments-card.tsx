import { FileText, Paperclip, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { formatDateTime, fullName } from "@/lib/utils";
import {
  ATTACHMENT_KIND_LABELS,
  type AttachmentKind,
} from "@/lib/attachments";
import { deleteAttachment, uploadAttachment } from "@/lib/actions/attachments";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionForm, QuickActionForm } from "@/components/action-form";

/**
 * Server-rendered attachment list + upload form for a parent record.
 * Visibility of the card itself is decided by the caller; `canManage`
 * controls the upload/delete controls.
 */
export async function AttachmentsCard({
  entityType,
  entityId,
  canManage,
}: {
  entityType: string;
  entityId: string;
  canManage: boolean;
}) {
  const attachments = await db.attachment.findMany({
    where: { entityType, entityId },
    include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
  });

  const isRecognition = entityType === "Recognition";

  return (
    <Card>
      <CardHeader
        icon={Paperclip}
        title="Attachments"
        description={
          canManage
            ? isRecognition
              ? "Tag each file with the accreditation requirement it satisfies."
              : "PDF, PNG, JPEG, WebP or Word files up to 10 MB."
            : "Supporting documents submitted with this record."
        }
      />
      <CardContent className="space-y-4">
        {attachments.length === 0 ? (
          <EmptyState icon={FileText} title="No attachments" description="No files have been attached yet." />
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
                  <FileText className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={`/attachments/${a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-semibold text-content hover:text-primary"
                  >
                    {a.fileName}
                  </a>
                  <p className="text-xs text-content-secondary">
                    {(a.kind
                      ? `${ATTACHMENT_KIND_LABELS[a.kind as AttachmentKind]} · `
                      : "")}
                    {(a.sizeBytes / 1024).toFixed(0)} KB ·{" "}
                    {formatDateTime(a.createdAt)}
                    {a.uploadedBy ? ` · ${fullName(a.uploadedBy)}` : ""}
                  </p>
                </div>
                {canManage && (
                  <QuickActionForm
                    action={deleteAttachment}
                    hidden={{ id: a.id }}
                    label=""
                    confirmMessage={`Delete “${a.fileName}”? This cannot be undone.`}
                    variant="ghost"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </QuickActionForm>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <ActionForm
            action={uploadAttachment}
            submitLabel="Upload"
            variant="outline"
            footerClassName="mt-3"
            className="space-y-3"
          >
            <input type="hidden" name="entityType" value={entityType} />
            <input type="hidden" name="entityId" value={entityId} />
            {isRecognition && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-content-secondary">
                  Accreditation requirement
                </span>
                <select
                  name="kind"
                  defaultValue=""
                  className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
                >
                  <option value="">Other / supporting document</option>
                  {(Object.keys(ATTACHMENT_KIND_LABELS) as AttachmentKind[]).map((k) => (
                    <option key={k} value={k}>
                      {ATTACHMENT_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-content-secondary">Add a file</span>
              <input
                type="file"
                name="file"
                required
                accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="w-full cursor-pointer rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-content hover:file:bg-line"
              />
            </label>
          </ActionForm>
        )}
      </CardContent>
    </Card>
  );
}
