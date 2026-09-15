import Link from "next/link";
import { Archive, FileUp, FileText, MessageSquare, Printer } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import {
  FINANCIAL_FILE_KIND_LABELS,
  FINANCIAL_STATUS_META,
  SUBMITTED_STATES,
  applicableFinancialDeadlines,
  financialSigningRoles,
  isFinancialEditable,
  type FinancialProcess,
} from "@/lib/financial";
import { SIGNATORY_LABELS } from "@/lib/form-routes";
import { authorizeCurrentSigner } from "@/lib/signature-routing";
import { verifySignatureChain } from "@/lib/signature-integrity";
import {
  addFinancialComment,
  archiveFinancialSubmission,
  deleteFinancialFile,
  startFinancialDraft,
  submitFinancialRequirement,
  uploadFinancialFile,
} from "@/lib/actions/financial";
import { SignatureRoutePanel } from "@/components/forms/signature-route-panel";
import { Badge, Chip } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ActionForm, QuickActionForm } from "@/components/action-form";
import { Field, Select, Textarea } from "@/components/ui/form";

export type FinancialRequirementRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  process: FinancialProcess;
  signers: import("@/generated/prisma/client").SignatoryRole[];
};

export type FinancialSubmissionRow = {
  id: string;
  academicYear: string;
  status: string;
  version: number;
  requirementId: string;
  organizationId: string;
  submittedAt: Date | null;
  decidedAt: Date | null;
  resubmittedAt: Date | null;
  deadline: { id: string; name: string; dueDate: Date } | null;
  comments: {
    id: string;
    createdAt: Date;
    body: string;
    author: { id: string; firstName: string; lastName: string; role: string };
  }[];
};

export type FinancialAttachmentRow = {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  kind: string | null;
  version: number;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: { id: string; firstName: string; lastName: string } | null;
};

export type FinancialRouteRow = {
  id: string;
  entityId: string;
  formKey: string;
  state: import("@/generated/prisma/client").RouteState;
  version: number;
  steps: {
    id: string;
    order: number;
    role: import("@/generated/prisma/client").SignatoryRole;
    status: import("@/generated/prisma/client").SignatureStepStatus;
    signerId: string | null;
    signer: { id: string; firstName: string; lastName: string } | null;
    signedAt: Date | null;
    comment: string | null;
    signatureMethod: string | null;
    chainHash: string | null;
    prevChainHash: string | null;
    contentHash: string | null;
  }[];
};

export type FinancialDeadlineRow = {
  id: string;
  name: string;
  isActive: boolean;
  process: string;
  academicYear: string;
  dueDate: Date;
  scopeType: import("@/generated/prisma/client").DeadlineScope;
  scopeCollegeId: string | null;
};

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Whether a passing/fledgling deadline applies to this org + cycle and has lapsed. */
export function isDueFor(
  req: FinancialRequirementRow,
  orgType: string,
  orgCollegeId: string | null,
  ay: string,
  deadlines: FinancialDeadlineRow[]
): boolean {
  return applicableFinancialDeadlines(
    req,
    { type: orgType, collegeId: orgCollegeId ?? "" },
    ay,
    deadlines
  )
    .map((d) => d.dueDate)
    .some((d) => d.getTime() < new Date().getTime());
}

/** Highest-status lifecycle string for the submission given its routing state. */
export function financialSubmissionStatus(
  sub: Pick<FinancialSubmissionRow, "status" | "resubmittedAt" | "id">,
  route: FinancialRouteRow | undefined
): string {
  if (!route) return sub.status;
  if (route.state === "RETURNED_FOR_REVISION" || route.state === "REJECTED") return "RETURNED";
  if (route.state === "COMPLETED") return "APPROVED";
  if (sub.resubmittedAt || route.version > 1) return "RESUBMITTED";
  if (route.steps.some((st) => st.status === "SIGNED" && st.role !== "PRESIDENT" && st.role !== "SECRETARY")) {
    return "UNDER_REVIEW";
  }
  return "SUBMITTED";
}

/**
 * The filing workflow for one financial requirement across its lifecycle:
 * start → upload → submit → sequential signature chain → approval → archive.
 * Shared between the financial compliance workspace and the accreditation
 * Financial Report requirement page.
 */
export async function RequirementFiling({
  orgId,
  req,
  sub,
  status,
  files,
  route,
  ay,
  orgType,
  orgCollegeId,
  deadlines,
  user,
  canEdit,
  canArchive,
  hasAccess,
}: {
  orgId: string;
  req: FinancialRequirementRow;
  sub: FinancialSubmissionRow | undefined;
  status: string;
  files: Map<string, FinancialAttachmentRow[]>;
  route: FinancialRouteRow | undefined;
  ay: string;
  orgType: string;
  orgCollegeId: string | null;
  deadlines: FinancialDeadlineRow[];
  user: { id: string; role: string; collegeId: string | null };
  canEdit: boolean;
  canArchive: boolean;
  hasAccess: boolean;
}) {
  const meta = FINANCIAL_STATUS_META[status];

  if (!sub) {
    const pastDue = isDueFor(req, orgType, orgCollegeId, ay, deadlines);
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-content-secondary">Not started for AY {ay}.</p>
          <p className="mt-1 text-xs text-content-muted">
            Sign order · {financialSigningRoles(req).map((r) => SIGNATORY_LABELS[r]).join(" → ")}
          </p>
          {pastDue && <Badge tone="danger" className="mt-2">past due</Badge>}
        </div>
        {hasAccess && canEdit && (
          <ActionForm action={startFinancialDraft} submitLabel="Start filing" footerClassName="mt-0">
            <input type="hidden" name="organizationId" value={orgId} />
            <input type="hidden" name="requirementId" value={req.id} />
            <input type="hidden" name="academicYear" value={ay} />
          </ActionForm>
        )}
      </div>
    );
  }

  const subFiles = files.get(sub.id) ?? [];
  const currentVersionFiles = subFiles.filter((f) => f.version === sub.version);
  const overdue =
    !(SUBMITTED_STATES as readonly string[]).includes(status) &&
    isDueFor(req, orgType, orgCollegeId, sub.academicYear, deadlines);
  const editable = isFinancialEditable(sub.status);

  let viewerCanSignNow = false;
  if (route && hasAccess) {
    try {
      await authorizeCurrentSigner({
        entityType: "FinancialSubmission",
        entityId: sub.id,
        userId: user.id,
      });
      viewerCanSignNow = true;
    } catch {
      viewerCanSignNow = false;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta?.tone ?? "neutral"}>{meta?.label ?? status}</Badge>
          <Chip>v{sub.version}</Chip>
          {overdue && <Badge tone="danger">overdue</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-content-muted">
          {sub.submittedAt && <span>submitted {formatDateTime(sub.submittedAt)}</span>}
          {sub.decidedAt && <span>decided {formatDateTime(sub.decidedAt)}</span>}
          {sub.deadline && <span>deadline {formatDateTime(sub.deadline.dueDate)}</span>}
        </div>
      </div>

      {(status === "APPROVED" || status === "ARCHIVED") && (
        <div>
          <Link
            href={`/print/financial/${sub.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-content hover:border-primary hover:text-primary"
          >
            <Printer className="size-3.5" aria-hidden />
            Print record
          </Link>
        </div>
      )}

      {status === "RETURNED" && route?.state === "RETURNED_FOR_REVISION" && (
        <Alert tone="warning" title="Returned for revision">
          Correct the documents, then resubmit through the President / Secretary step.
        </Alert>
      )}

      {currentVersionFiles.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {currentVersionFiles.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <FileText className="size-4 shrink-0 text-content-muted" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-content">{f.fileName}</p>
                  <p className="text-[11px] text-content-muted">
                    {FINANCIAL_FILE_KIND_LABELS[f.kind as never] ?? f.kind} · {fileSize(f.sizeBytes)}
                    {f.uploadedBy ? ` · ${f.uploadedBy.firstName} ${f.uploadedBy.lastName}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/attachments/${f.id}`} className="text-xs font-semibold text-primary hover:underline">
                  Download
                </Link>
                {editable && canEdit && (
                  <QuickActionForm
                    action={deleteFinancialFile}
                    hidden={{ id: f.id }}
                    label="Remove"
                    variant="ghost"
                    confirmMessage={`Remove ${f.fileName}?`}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {sub.status === "DRAFT" && canEdit && (
        <p className="text-xs text-content-muted">
          Attach the required document below, then submit. Supporting documents may still be added while the
          submission is editable.
        </p>
      )}

      {editable && canEdit && (
        <div className="rounded-lg border border-dashed border-line-strong p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content-muted">
            <FileUp className="size-3.5" aria-hidden /> Upload document
          </p>
          <ActionForm
            action={uploadFinancialFile}
            submitLabel="Upload"
            pendingLabel="Uploading…"
            footerClassName="mt-2"
            className="flex flex-wrap items-end gap-3"
          >
            <input type="hidden" name="submissionId" value={sub.id} />
            <input
              type="file"
              name="file"
              required
              accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"
              className="block w-72 max-w-full text-sm text-content"
            />
            <Field label="Role" htmlFor={`purpose-${sub.id}`} className="min-w-40">
              <Select id={`purpose-${sub.id}`} name="purpose" required defaultValue="FINANCIAL_DOCUMENT">
                <option value="FINANCIAL_DOCUMENT">Required document</option>
                <option value="FINANCIAL_SUPPORTING">Supporting document</option>
              </Select>
            </Field>
          </ActionForm>
        </div>
      )}

      {route ? (
        <SignatureRoutePanel
          route={{
            id: route.id,
            formKey: route.formKey,
            state: route.state,
            version: route.version,
            steps: route.steps.map((s) => ({
              id: s.id,
              order: s.order,
              role: s.role,
              status: s.status,
              signerName: s.signerId && s.signer ? `${s.signer.firstName} ${s.signer.lastName}` : null,
              signedAt: s.signedAt,
              comment: s.comment,
            })),
          }}
          viewerId={user.id}
          viewerCanSignNow={viewerCanSignNow}
          verification={verifySignatureChain(
            route.steps.map((s) => ({
              order: s.order,
              role: s.role,
              signedAt: s.signedAt,
              status: s.status,
              signatureMethod: s.signatureMethod,
              signerId: s.signerId,
              chainHash: s.chainHash,
              prevChainHash: s.prevChainHash,
              contentHash: s.contentHash,
            }))
          )}
        />
      ) : editable && canEdit ? (
        <ActionForm action={submitFinancialRequirement} submitLabel="Submit for signature" footerClassName="mt-0">
          <input type="hidden" name="submissionId" value={sub.id} />
          Routes through{" "}
          <b>{financialSigningRoles(req).map((r) => SIGNATORY_LABELS[r]).join(" → ")}</b>.
        </ActionForm>
      ) : null}

      {status === "APPROVED" && canArchive && (
        <ActionForm action={archiveFinancialSubmission} submitLabel="Archive in OSAS records" variant="outline" footerClassName="mt-0">
          <input type="hidden" name="submissionId" value={sub.id} />
          <Archive className="mr-1 inline size-4" aria-hidden />
          Completes the record and makes it read-only for everyone.
        </ActionForm>
      )}

      <div className="rounded-lg border border-line p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content-muted">
          <MessageSquare className="size-3.5" aria-hidden /> Comments
        </p>
        {sub.comments.length > 0 ? (
          <ul className="space-y-2">
            {sub.comments.map((c) => (
              <li key={c.id} className="rounded-lg bg-background px-3 py-2">
                <p className="text-xs font-semibold text-content">
                  {c.author.firstName} {c.author.lastName}
                  <span className="ml-2 font-normal text-content-muted">{formatDateTime(c.createdAt)}</span>
                </p>
                <p className="mt-0.5 text-sm text-content-secondary whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-content-muted">No comments yet.</p>
        )}
        {hasAccess && (
          <ActionForm action={addFinancialComment} submitLabel="Post comment" footerClassName="mt-2" className="mt-3">
            <input type="hidden" name="submissionId" value={sub.id} />
            <Field label="Comment" htmlFor={`comment-${sub.id}`}>
              <Textarea
                id={`comment-${sub.id}`}
                name="body"
                rows={2}
                required
                placeholder="Question or note for the officers, advisers, or reviewers…"
              />
            </Field>
          </ActionForm>
        )}
      </div>
    </div>
  );
}