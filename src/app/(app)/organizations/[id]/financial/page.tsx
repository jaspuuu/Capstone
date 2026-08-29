import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, FileUp, FileText, MessageSquare, Printer, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can, orgScopeWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { currentAcademicYear, formatDateTime } from "@/lib/utils";
import {
  FINANCIAL_FILE_KIND_LABELS,
  FINANCIAL_PROCESS_LABELS,
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
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge, Chip } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ActionForm, QuickActionForm } from "@/components/action-form";
import { Field, Select, Textarea } from "@/components/ui/form";

export const instant = false;

export const metadata: Metadata = { title: "Financial compliance" };

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type RequirementRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  process: FinancialProcess;
  signers: import("@/generated/prisma/client").SignatoryRole[];
};
type SubmissionRow = Awaited<ReturnType<typeof loadSubmissions>>[number];
type AttachmentRow = Awaited<ReturnType<typeof loadAttachments>>[number];
type RouteRow = {
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
type DeadlineRow = {
  id: string;
  name: string;
  isActive: boolean;
  process: string;
  academicYear: string;
  dueDate: Date;
  scopeType: import("@/generated/prisma/client").DeadlineScope;
  scopeCollegeId: string | null;
};

function loadSubmissions(orgId: string) {
  return db.financialSubmission.findMany({
    where: { organizationId: orgId },
    include: {
      deadline: { select: { id: true, name: true, dueDate: true } },
      comments: {
        include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ academicYear: "desc" }, { createdAt: "asc" }],
  });
}

function loadAttachments(subIds: string[]) {
  return db.attachment.findMany({
    where: { entityType: "FinancialSubmission", entityId: { in: subIds } },
    include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export default async function OrgFinancialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const org = await db.organization.findFirst({
    where: { AND: [orgScopeWhere(user), { id }] },
    select: {
      id: true,
      name: true,
      acronym: true,
      type: true,
      status: true,
      collegeId: true,
      college: { select: { name: true } },
      advisers: { where: { isCurrent: true }, select: { adviserId: true } },
    },
  });
  if (!org) notFound();

  const ay = currentAcademicYear();
  const isAdmin = can(user, "org.manage");
  const canConfig = can(user, "financial.manage");
  const isOfficer = user.role === "PRESIDENT" || user.role === "SECRETARY";
  const isCurrentMember =
    user.role === "MEMBER" ||
    isOfficer ||
    (await db.organizationMember.findFirst({
      where: { userId: user.id, organizationId: org.id, isCurrent: true },
      select: { id: true },
    })) !== null;
  const isCurrentAdviser =
    (user.role === "ADVISER_REGULAR" || user.role === "ADVISER_PARTTIME") &&
    org.advisers.some((a) => a.adviserId === user.id);
  const hasAccess =
    isAdmin ||
    isCurrentMember ||
    isCurrentAdviser ||
    (user.role === "DEAN" && user.collegeId != null && user.collegeId === org.collegeId);
  const canEdit = isAdmin || isOfficer;

  const [requirements, submissions, rawDeadlines] = await Promise.all([
    db.financialRequirement.findMany({
      orderBy: [{ process: "asc" }, { code: "asc" }],
    }) as Promise<RequirementRow[]>,
    loadSubmissions(org.id),
    db.deadline.findMany({
      where: { isActive: true },
      select: { id: true, name: true, isActive: true, process: true, academicYear: true, dueDate: true, scopeType: true, scopeCollegeId: true },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const subIds = submissions.map((s) => s.id);
  const [routeRows, attachments] = await Promise.all([
    db.signatureRoute.findMany({
      where: { entityType: "FinancialSubmission", entityId: { in: subIds } },
      include: {
        steps: {
          orderBy: { order: "asc" },
          include: { signer: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    }) as Promise<RouteRow[]>,
    loadAttachments(subIds),
  ]);

  const filesBySub = new Map<string, AttachmentRow[]>();
  for (const a of attachments) {
    const list = filesBySub.get(a.entityId) ?? [];
    list.push(a);
    filesBySub.set(a.entityId, list);
  }
  const routeBySub = new Map<string, RouteRow>();
  for (const r of routeRows) routeBySub.set(r.entityId, r);

  const statusOf = (s: SubmissionRow) =>
    (routeBySub.get(s.id)
      ? (() => {
          const r = routeBySub.get(s.id)!;
          return r.state === "RETURNED_FOR_REVISION" || r.state === "REJECTED"
            ? "RETURNED"
            : r.state === "COMPLETED"
              ? "APPROVED"
              : s.resubmittedAt || r.version > 1
                ? "RESUBMITTED"
                : r.steps.some(
                    (st) => st.status === "SIGNED" && st.role !== "PRESIDENT" && st.role !== "SECRETARY"
                  )
                  ? "UNDER_REVIEW"
                  : "SUBMITTED";
        })()
      : s.status) as string;

  const summary = { PENDING: 0, SUBMITTED: 0, RETURNED: 0, APPROVED: 0 };
  for (const s of submissions) {
    if (s.academicYear !== ay) continue;
    const st = statusOf(s);
    if (st === "APPROVED" || st === "ARCHIVED") summary.APPROVED += 1;
    else if (st === "RETURNED" || st === "RESUBMITTED") summary.RETURNED += 1;
    else if (st === "SUBMITTED" || st === "UNDER_REVIEW") summary.SUBMITTED += 1;
    else summary.PENDING += 1;
  }

  const currentSubs = submissions.filter((s) => s.academicYear === ay);
  const history = submissions.filter((s) => s.academicYear !== ay);

  return (
    <>
      <PageHeader
        title="Financial compliance"
        description={`${org.name} · document submissions required each cycle, signed in sequence and archived by OSAS.`}
        breadcrumb={[
          { label: "Organizations", href: "/organizations" },
          { label: org.acronym ?? org.name, href: `/organizations/${org.id}` },
          { label: "Financial" },
        ]}
      />

      {!hasAccess && !isAdmin ? (
        <Alert tone="danger" title="No access">
          You are not connected to this organization.
        </Alert>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {(
              [
                { label: "Pending filing", value: summary.PENDING, cls: "text-content" },
                { label: "Submitted / in review", value: summary.SUBMITTED, cls: "text-blue-600" },
                { label: "Returned", value: summary.RETURNED, cls: "text-red-600" },
                { label: "Approved", value: summary.APPROVED, cls: "text-emerald-600" },
              ] as const
            ).map((s) => (
              <div key={s.label} className="rounded-xl border border-line bg-surface p-4">
                <p className="text-xs text-content-muted">{s.label}</p>
                <p className={`font-display text-2xl font-bold ${s.cls}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {requirements.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-sm text-content-secondary">
                  No financial requirements are configured yet.
                  {canConfig && (
                    <>
                      {" "}
                      <Link href="/financial/requirements" className="font-semibold text-primary hover:underline">
                        Configure requirements →
                      </Link>
                    </>
                  )}
                </p>
              </CardContent>
            </Card>
          ) : (
            requirements.map((req) => {
              const sub = currentSubs.find((s) => s.requirementId === req.id);
              return (
                <Card key={req.id}>
                  <CardHeader
                    icon={Wallet}
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        {req.name}
                        <Chip>{req.code}</Chip>
                        <Chip>{FINANCIAL_PROCESS_LABELS[req.process]}</Chip>
                      </span>
                    }
                    description={req.description ?? undefined}
                  />
                  <CardContent className="space-y-4">
                    <RequirementFiling
                      orgId={org.id}
                      req={req}
                      sub={sub}
                      status={sub ? statusOf(sub) : "UNSUBMITTED"}
                      files={filesBySub}
                      route={routeBySub.get(sub?.id ?? "")}
                      ay={sub?.academicYear ?? ay}
                      orgType={org.type}
                      orgCollegeId={org.collegeId}
                      deadlines={rawDeadlines}
                      user={user}
                      canEdit={canEdit}
                      canArchive={canConfig}
                      hasAccess={hasAccess || isAdmin}
                    />
                    {history.some((s) => s.requirementId === req.id) && (
                      <details className="rounded-lg border border-line px-4 py-3">
                        <summary className="cursor-pointer text-xs font-semibold text-content-secondary">
                          Previous cycles ({history.filter((s) => s.requirementId === req.id).length})
                        </summary>
                        <ul className="mt-2 space-y-1.5">
                          {history
                            .filter((s) => s.requirementId === req.id)
                            .map((s) => (
                              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                <div className="min-w-0">
                                  <span className="font-semibold text-content">AY {s.academicYear}</span>
                                  <span className="ml-2 text-xs text-content-secondary">v{s.version}</span>
                                  {s.submittedAt && (
                                    <span className="ml-2 text-xs text-content-muted">
                                      submitted {formatDateTime(s.submittedAt)}
                                    </span>
                                  )}
                                </div>
                                <Badge tone={FINANCIAL_STATUS_META[s.status]?.tone ?? "neutral"}>
                                  {FINANCIAL_STATUS_META[s.status]?.label ?? s.status}
                                </Badge>
                              </li>
                            ))}
                        </ul>
                      </details>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </>
  );
}

function dueFor(
  req: RequirementRow,
  orgType: string,
  orgCollegeId: string | null,
  ay: string,
  deadlines: DeadlineRow[]
): boolean {
  const now = new Date();
  return applicableFinancialDeadlines(req, { type: orgType, collegeId: orgCollegeId }, ay, deadlines)
    .map((d) => d.dueDate)
    .some((d) => d.getTime() < now.getTime());
}

async function RequirementFiling({
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
  req: RequirementRow;
  sub: SubmissionRow | undefined;
  status: string;
  files: Map<string, AttachmentRow[]>;
  route: RouteRow | undefined;
  ay: string;
  orgType: string;
  orgCollegeId: string | null;
  deadlines: DeadlineRow[];
  user: { id: string; role: string; collegeId: string | null };
  canEdit: boolean;
  canArchive: boolean;
  hasAccess: boolean;
}) {
  const meta = FINANCIAL_STATUS_META[status];

  if (!sub) {
    const pastDue = dueFor(req, orgType, orgCollegeId, ay, deadlines);
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
    dueFor(req, orgType, orgCollegeId, sub.academicYear, deadlines);
  const editable = isFinancialEditable(sub.status);

  let viewerCanSignNow = false;
  if (route && hasAccess) {
    try {
      await authorizeCurrentSigner({
        entityType: "FinancialSubmission",
        entityId: sub.id,
        userId: user.id,
        org: { id: sub.organizationId, collegeId: orgCollegeId ?? "", academicYear: sub.academicYear },
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