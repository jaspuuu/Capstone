import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, CircleDashed, Download, FileStack, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { orgScopeWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import {
  APPLICATION_LETTER_KEY,
  checklistForYear,
  compliancePct,
} from "@/lib/analytics";
import {
  canDeleteAttachment,
  canManageAttachments,
  parentIsEditable,
  type ParentRef,
} from "@/lib/attachment-access";
import { ATTACHMENT_KIND_LABELS, type AttachmentKind } from "@/lib/attachments";
import { REQUIREMENT_STATUS_META } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { getSelectedAy } from "@/lib/ay-server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionForm, QuickActionForm } from "@/components/action-form";
import { deleteAttachment, updateAttachmentKind, uploadAttachment } from "@/lib/actions/attachments";

export const metadata: Metadata = { title: "Document repository" };

function fmtSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const FILE_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.docx,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export default async function OrganizationDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ay?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;

  const org = await db.organization.findFirst({
    where: { AND: [orgScopeWhere(user), { id }] },
    select: { id: true, name: true, acronym: true, collegeId: true },
  });
  if (!org) notFound();

  const [recognitions, reports, members] = await Promise.all([
    db.recognition.findMany({
      where: { organizationId: org.id },
      select: { id: true, academicYear: true, status: true },
      orderBy: { academicYear: "desc" },
    }),
    db.accomplishmentReport.findMany({
      where: { organizationId: org.id },
      select: { id: true, title: true, academicYear: true, status: true },
      orderBy: { createdAt: "desc" },
    }),
    db.organizationMember.findMany({
      where: { organizationId: org.id, isCurrent: true },
      select: { userId: true, position: true },
    }),
  ]);

  // Which academic year are we looking at? Defaults to the topbar-selected one.
  const selected = await getSelectedAy();
  const years = [...new Set([selected, ...recognitions.map((r) => r.academicYear)])];
  const ay = sp.ay && years.includes(sp.ay) ? sp.ay : selected;
  const yearRecs = recognitions.filter((r) => r.academicYear === ay);

  const attachments = yearRecs.length
    ? await db.attachment.findMany({
        where: { entityType: "Recognition", entityId: { in: yearRecs.map((r) => r.id) } },
        include: { uploadedBy: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // The recognition record that governs edit permissions for this year.
  const primary = yearRecs.find((r) => parentIsEditable(r.status)) ?? yearRecs[0];
  const parentRef: ParentRef | null = primary
    ? {
        id: primary.id,
        status: primary.status,
        organizationId: org.id,
        organization: { collegeId: org.collegeId, members },
      }
    : null;
  const canManage = parentRef ? canManageAttachments(user, parentRef) : false;

  const taggedFiles = attachments.filter(
    (a): a is typeof a & { kind: AttachmentKind } => a.kind !== null
  );
  const items = checklistForYear(
    recognitions,
    taggedFiles.map((a) => ({ academicYear: ay, kind: a.kind })),
    reports,
    ay
  );
  const pct = compliancePct(items);

  const byKind = new Map<AttachmentKind, typeof attachments>();
  for (const a of taggedFiles) {
    byKind.set(a.kind, [...(byKind.get(a.kind) ?? []), a]);
  }
  const others = attachments.filter((a) => a.kind === null);
  const reportEvidence = reports.filter(
    (r) => r.academicYear === ay && ["SUBMITTED", "ACCEPTED"].includes(r.status)
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-2 text-xs text-content-muted">
            <Link href="/organizations" className="font-medium hover:text-primary hover:underline">
              Organizations
            </Link>
            <span aria-hidden> / </span>
            <Link
              href={`/organizations/${org.id}`}
              className="font-medium hover:text-primary hover:underline"
            >
              {org.acronym ?? org.name}
            </Link>
            <span aria-hidden> / </span>
            <span className="font-medium text-content-secondary">Documents</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight text-content">
              Document repository
            </h1>
            <Badge tone={pct === 100 ? "success" : pct >= 50 ? "gold" : "danger"}>
              {items.filter((i) => i.met).length}/{items.length} requirements · {pct}%
            </Badge>
          </div>
          <p className="mt-1 text-sm text-content-secondary">
            Accreditation documents for <span className="font-semibold">{org.name}</span>, tracked
            against the seven SF-001 requirements.
          </p>
        </div>

        {/* Academic-year switcher */}
        <nav aria-label="Academic year" className="flex flex-wrap items-center gap-1.5">
          {years.map((y) => (
            <Link
              key={y}
              href={y === ay ? "#" : `/organizations/${org.id}/documents?ay=${encodeURIComponent(y)}`}
              aria-current={y === ay ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                y === ay
                  ? "bg-primary text-white"
                  : "border border-line-strong bg-surface text-content-secondary hover:border-primary hover:text-primary"
              }`}
            >
              AY {y}
            </Link>
          ))}
        </nav>
      </div>

      {!primary && (
        <Card className="mb-6 border-dashed">
          <CardContent className="py-8 text-center">
            <FileStack className="mx-auto size-8 text-content-muted" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-content">
              No accreditation application filed for AY {ay}.
            </p>
            <p className="mt-1 text-sm text-content-muted">
              Documents attach to the application record — file for recognition first.
            </p>
          </CardContent>
        </Card>
      )}

      {primary && !parentIsEditable(primary.status) && (
        <div className="mb-6 rounded-lg border border-line bg-surface-secondary px-4 py-3 text-sm text-content-secondary">
          The application for AY {ay} is{" "}
          <span className="font-semibold lowercase">{primary.status.toLowerCase()}</span> and locked
          for editing. New uploads here will not be possible until OSAS returns
          it or approves the next cycle.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Checklist */}
        <Card className="lg:col-span-2 self-start">
          <CardHeader
            icon={CheckCircle2}
            title={`SF-001 requirements · AY ${ay}`}
            description="Each document follows its application: Required → Submitted → Under Review → Approved (or Returned)."
          />
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
            {Object.entries(REQUIREMENT_STATUS_META).map(([k, m]) => (
              <Badge key={k} tone={m.tone}>
                {m.label}
              </Badge>
            ))}
          </div>
          <ul className="divide-y divide-line">
            {items.map((item) => {
              const files =
                item.key === APPLICATION_LETTER_KEY
                  ? []
                  : (byKind.get(item.key as AttachmentKind) ?? []);
              return (
                <li key={item.key} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {item.met ? (
                        <CheckCircle2 className="size-4.5 shrink-0 text-green-600" aria-hidden />
                      ) : (
                        <CircleDashed className="size-4.5 shrink-0 text-content-muted" aria-hidden />
                      )}
                      <span className="text-sm font-semibold text-content">{item.label}</span>
                    </div>
                    <Badge tone={REQUIREMENT_STATUS_META[item.status].tone}>
                      {REQUIREMENT_STATUS_META[item.status].label}
                    </Badge>
                  </div>

                  {(files.length > 0 || (item.key === "ACCOMPLISHMENT_REPORTS" && reportEvidence.length > 0)) && (
                    <ul className="mt-2 ml-7 space-y-1.5">
                      {files.map((a) => (
                        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <a
                            href={`/attachments/${a.id}`}
                            className="inline-flex min-w-0 items-center gap-1.5 font-medium text-primary hover:underline"
                          >
                            <Download className="size-3 shrink-0" aria-hidden />
                            <span className="truncate">{a.fileName}</span>
                          </a>
                          <span className="shrink-0 text-content-muted">
                            {fmtSize(a.sizeBytes)} · {formatDate(a.createdAt)}
                          </span>
                          {parentRef && canDeleteAttachment(user, a.uploadedById, parentRef) && (
                            <QuickActionForm
                              action={deleteAttachment}
                              hidden={{ id: a.id }}
                              label=""
                              variant="ghost"
                              confirmMessage={`Delete ${a.fileName}?`}
                            >
                              <Trash2 className="size-3.5 text-red-600" aria-hidden />
                            </QuickActionForm>
                          )}
                        </li>
                      ))}
                      {item.key === "ACCOMPLISHMENT_REPORTS" &&
                        reportEvidence.map((r) => (
                          <li key={r.id} className="text-xs">
                            <Link
                              href={`/reports/${r.id}`}
                              className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                            >
                              <Download className="size-3 shrink-0" aria-hidden />
                              <span className="truncate">{r.title}</span>
                            </Link>
                            <span className="ml-2 text-content-muted">(accomplishment report)</span>
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Right column */}
        <div className="space-y-6">
          {canManage && parentRef && (
            <Card>
              <CardHeader icon={FileStack} title="Upload a document" description="PDF, image, or DOCX up to 10 MB." />
              <CardContent>
                <ActionForm action={uploadAttachment} submitLabel="Upload" variant="outline" className="space-y-3" footerClassName="mt-3">
                  <input type="hidden" name="entityType" value="Recognition" />
                  <input type="hidden" name="entityId" value={parentRef.id} />
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-content-secondary">
                      Requirement
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
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-content-secondary">File</span>
                    <input
                      type="file"
                      name="file"
                      required
                      accept={FILE_ACCEPT}
                      className="w-full cursor-pointer rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-content hover:file:bg-line"
                    />
                  </label>
                </ActionForm>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader
              icon={Download}
              title="Other supporting documents"
              description={`${others.length} untagged file${others.length === 1 ? "" : "s"} for AY ${ay}.`}
            />
            <CardContent>
              {others.length === 0 && parentRef ? (
                <EmptyState
                  title="No extra files"
                  description="Supporting documents that do not map to a requirement appear here."
                  className="border-0"
                />
              ) : !parentRef ? (
                <p className="text-sm text-content-muted">Nothing filed yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {others.map((a) => (
                    <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <a
                          href={`/attachments/${a.id}`}
                          className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                        >
                          <Download className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{a.fileName}</span>
                        </a>
                        {parentRef && canDeleteAttachment(user, a.uploadedById, parentRef) && (
                          <QuickActionForm
                            action={deleteAttachment}
                            hidden={{ id: a.id }}
                            label=""
                            variant="ghost"
                            confirmMessage={`Delete ${a.fileName}?`}
                          >
                            <Trash2 className="size-3.5 text-red-600" aria-hidden />
                          </QuickActionForm>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-content-muted">
                        {fmtSize(a.sizeBytes)} · uploaded by{" "}
                        {a.uploadedBy.firstName} {a.uploadedBy.lastName} · {formatDate(a.createdAt)}
                      </p>
                      {canManage && (
                        <form action={updateAttachmentKind} className="mt-2 flex items-center gap-2">
                          <input type="hidden" name="id" value={a.id} />
                          <select
                            name="kind"
                            defaultValue=""
                            aria-label={`Tag ${a.fileName} against a requirement`}
                            className="w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-xs"
                          >
                            <option value="">Keep as supporting document…</option>
                            {(Object.keys(ATTACHMENT_KIND_LABELS) as AttachmentKind[]).map((k) => (
                              <option key={k} value={k}>
                                Tag as: {ATTACHMENT_KIND_LABELS[k]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="shrink-0 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-xs font-semibold text-content hover:border-primary"
                          >
                            Save
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
