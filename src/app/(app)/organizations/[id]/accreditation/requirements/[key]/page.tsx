import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Circle,
  CircleCheck,
  FileText,
  FilePlus2,
  PenLine,
  UploadCloud,
} from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can, orgScopeWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { parentIsEditable } from "@/lib/attachment-access";
import { currentAcademicYear, formatDateTime } from "@/lib/utils";
import { RECOGNITION_STATUS_META, REQUIREMENT_STATUS_META } from "@/lib/constants";
import { checklistForYear, requirementLabel, type RequirementKey, type RequirementStatus } from "@/lib/analytics";
import { isDocumentRequirement } from "@/lib/form-routes";
import { getRouteWithSteps } from "@/lib/signature-routing";
import { sfRouteEntityId } from "@/lib/form-routes";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RequirementUploadDropzone } from "@/components/recognition/requirement-upload-dropzone";
import {
  RequirementFiling,
  financialSubmissionStatus,
  type FinancialAttachmentRow,
  type FinancialDeadlineRow,
  type FinancialRequirementRow,
  type FinancialRouteRow,
  type FinancialSubmissionRow,
} from "@/components/financial/requirement-filing";

export const instant = false;

export const metadata: Metadata = { title: "Requirement" };

const LIFECYCLE_ORDER: RequirementStatus[] = [
  "REQUIRED",
  "UPLOADED",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
];

export default async function RequirementUploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; key: string }>;
  searchParams: Promise<{ ay?: string }>;
}) {
  const user = await requireUser();
  if (user.role === "MEMBER") notFound();
  const { id, key } = await params;
  if (!isDocumentRequirement(key)) notFound();
  const keyUpper = key.toUpperCase() as RequirementKey;
  const sp = await searchParams;
  const ay = sp.ay && /^\d{4}-\d{4}$/.test(sp.ay) ? sp.ay : currentAcademicYear();

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

  const rec = await db.recognition.findFirst({
    where: { organizationId: id, academicYear: ay },
    select: {
      id: true,
      academicYear: true,
      status: true,
      kind: true,
      organizationId: true,
      submittedAt: true,
    },
  });

  // The checklist drives this page's lifecycle badge exactly like the rest of
  // the accreditation module.
  const [attachments, reports, financialSubmissions] = rec
    ? await Promise.all([
        db.attachment.findMany({
          where: { entityType: "Recognition", entityId: rec.id },
          include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: "asc" },
        }),
        db.accomplishmentReport.findMany({
          where: { organizationId: id, academicYear: ay },
          orderBy: { submittedAt: "desc" },
        }),
        db.financialSubmission.findMany({
          where: { organizationId: id, academicYear: ay },
          select: { academicYear: true, status: true },
        }),
      ])
    : [[], [], []];

  const items = rec
    ? checklistForYear(
        [{ academicYear: rec.academicYear, status: rec.status, kind: rec.kind }],
        attachments
          .filter((a) => a.kind !== null)
          .map((a) => ({ academicYear: ay, kind: a.kind! })),
        reports.map((r) => ({ academicYear: r.academicYear, status: r.status })),
        ay,
        financialSubmissions,
        rec.kind
      )
    : [];
  const item = items.find((i) => i.key === keyUpper) ?? null;

  // The recognition status badge (works even if the item badge is absent).
  const fileTagged = attachments.filter((a) => a.kind === keyUpper);
  const primaryFile = fileTagged[fileTagged.length - 1] ?? null;

  // Signature chain line — these document requirements ride the SF-001/002
  // application packet, so their chain is the packet's own signing route.
  const chain = rec
    ? await getRouteWithSteps("SF", sfRouteEntityId("SF001", id, ay))
    : null;
  const chainCompleted = chain ? chain.steps.filter((s) => s.status === "SIGNED").length : 0;
  const chainTotal = chain?.steps.length ?? 0;

  const editable = rec != null && parentIsEditable(rec.status);

  const isAdmin = can(user, "org.manage");
  const isOfficer = user.role === "PRESIDENT" || user.role === "SECRETARY";
  const isCurrentMember =
    isOfficer ||
    (await db.organizationMember.findFirst({
      where: { userId: user.id, organizationId: id, isCurrent: true },
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

  const lifecycleIndex = item ? LIFECYCLE_ORDER.indexOf(item.status) : -1;

  let body: React.ReactNode;
  if (!rec) {
    body = (
      <EmptyState
        icon={Award}
        title="No application for this cycle"
        description={`${org.name} has not filed an application for AY ${ay} yet. Start one from the accreditation page first.`}
      />
    );
  } else if (keyUpper === "FINANCIAL_REPORT") {
    body = <FinancialBody org={org} id={id} ay={ay} user={user} canEdit={canEdit} hasAccess={hasAccess} />;
  } else if (keyUpper === "ACCOMPLISHMENT_REPORTS") {
    body = <ReportsBody orgId={id} ay={ay} reports={reports} />;
  } else {
    body = (
      <div className="space-y-4">
        {fileTagged.length > 0 && keyUpper === "SUPPORTING_DOCUMENTS" && (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {fileTagged.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <a
                    href={`/attachments/${a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-sm font-semibold text-content hover:text-primary"
                  >
                    {a.fileName}
                  </a>
                  <p className="text-xs text-content-secondary">
                    {(a.sizeBytes / 1024).toFixed(0)} KB
                    {a.uploadedBy
                      ? ` · ${a.uploadedBy.firstName} ${a.uploadedBy.lastName}`
                      : ""}
                    {a.notes ? ` · ${a.notes}` : ""}
                  </p>
                </div>
                <span className="text-xs text-content-muted">{formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <RequirementUploadDropzone
          entityId={rec.id}
          kind={keyUpper as "CONSTITUTION" | "SUPPORTING_DOCUMENTS" | "ACCOMPLISHMENT_REPORTS" | "FINANCIAL_REPORT"}
          existing={primaryFile ? { id: primaryFile.id, fileName: primaryFile.fileName, sizeBytes: primaryFile.sizeBytes, notes: primaryFile.notes } : null}
        />
        <p className="text-xs text-content-muted">
          {keyUpper === "SUPPORTING_DOCUMENTS"
            ? "Attach supplementary evidence that supports your application. Multiple files may be added."
            : "Replace the document at any time before the application is submitted."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <Link
          href={`/organizations/${id}/accreditation?ay=${encodeURIComponent(ay)}`}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-content-secondary hover:text-primary hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to accreditation
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight text-content">
            {requirementLabel(keyUpper)}
          </h1>
          {item && (
            <Badge tone={REQUIREMENT_STATUS_META[item.status].tone}>
              {REQUIREMENT_STATUS_META[item.status].label}
            </Badge>
          )}
          {rec && (
            <>
              <Badge tone={rec.kind === "RENEWAL" ? "gold" : "primary"}>
                {rec.kind === "RENEWAL" ? "Renewal" : "Initial Recognition"}
              </Badge>
              <Badge tone={RECOGNITION_STATUS_META[rec.status].tone}>
                {RECOGNITION_STATUS_META[rec.status].label}
              </Badge>
            </>
          )}
        </div>
        <p className="mt-1 text-sm text-content-secondary">
          {org.acronym ?? org.name} · AY {ay}
        </p>
      </div>

      {/* Packet chain line */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-2 text-content-secondary">
              <PenLine className="size-4 text-content-muted" aria-hidden />
              Rides the application packet chain —
              <span className="font-semibold text-content">
                SF-001 · {chainCompleted}/{chainTotal} steps signed
              </span>
            </span>
            <span className="inline-flex items-center gap-2 text-content-secondary">
              <CalendarDays className="size-4 text-content-muted" aria-hidden />
              Academic year <span className="font-semibold text-content">{ay}</span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Lifecycle strip */}
      <Card className="mb-6">
        <CardContent className="py-5">
          <div className="flex items-center justify-between gap-2 overflow-x-auto">
            {LIFECYCLE_ORDER.map((stage, i) => {
              const active = i === lifecycleIndex;
              const done = lifecycleIndex > i;
              return (
                <div key={stage} className="flex min-w-16 flex-1 items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                        done
                          ? "bg-success text-white"
                          : active
                            ? "bg-primary text-white"
                            : "bg-line text-content-muted"
                      }`}
                    >
                      {done || active ? (
                        <CircleCheck className="size-4" aria-hidden />
                      ) : (
                        <Circle className="size-4" aria-hidden />
                      )}
                    </span>
                    <span
                      className={`whitespace-nowrap text-xs font-semibold ${
                        active ? "text-content" : done ? "text-success" : "text-content-muted"
                      }`}
                    >
                      {REQUIREMENT_STATUS_META[stage].label}
                    </span>
                  </div>
                  {i < LIFECYCLE_ORDER.length - 1 && (
                    <span className={`h-0.5 flex-1 rounded ${done ? "bg-success" : "bg-line"}`} />
                  )}
                </div>
              );
            })}
            {item?.status === "RETURNED" && (
              <Badge tone="orange" className="ml-2 shrink-0">
                Needs Revision
              </Badge>
            )}
          </div>
          {item && item.filed && (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-content-secondary">
              <CheckCircle2 className="size-3.5 text-success" aria-hidden />
              Document is on file. It counts as a completed requirement only after final approval.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          icon={UploadCloud}
          title={
            keyUpper === "FINANCIAL_REPORT"
              ? "Financial filing"
              : keyUpper === "ACCOMPLISHMENT_REPORTS"
                ? "Accomplishment reports"
                : "Document upload"
          }
          description={
            keyUpper === "FINANCIAL_REPORT"
              ? "Submitted through the official Part 12 financial requirements — signed in sequence by OSAS."
              : keyUpper === "ACCOMPLISHMENT_REPORTS"
                ? "File the previous cycle's accomplishment report records."
                : "Upload the governing document as a PDF, Word, or Excel file."
          }
        />
        <CardContent>
          <div className="mb-4">
            <a
              href={`/organizations/${id}/documents?ay=${encodeURIComponent(ay)}`}
              className="text-xs font-semibold text-primary hover:underline"
            >
              View this in the document repository →
            </a>
          </div>
          {!editable && rec && (
            <p className="mb-4 text-xs text-content-muted">
              Uploads are locked once the application is submitted or decided.
            </p>
          )}
          {body}
        </CardContent>
      </Card>
    </>
  );
}

async function FinancialBody({
  org,
  id,
  ay,
  user,
  canEdit,
  hasAccess,
}: {
  org: { id: string; type: string; collegeId: string | null };
  id: string;
  ay: string;
  user: { id: string; role: string; collegeId: string | null };
  canEdit: boolean;
  hasAccess: boolean;
}) {
  const [requirements, submissions, rawDeadlines] = await Promise.all([
    db.financialRequirement.findMany({
      orderBy: [{ process: "asc" }, { code: "asc" }],
    }) as Promise<FinancialRequirementRow[]>,
    db.financialSubmission.findMany({
      where: { organizationId: id },
      include: {
        deadline: { select: { id: true, name: true, dueDate: true } },
        comments: {
          include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ academicYear: "desc" }, { createdAt: "asc" }],
    }) as Promise<FinancialSubmissionRow[]>,
    db.deadline.findMany({
      where: { isActive: true },
      select: { id: true, name: true, isActive: true, process: true, academicYear: true, dueDate: true, scopeType: true, scopeCollegeId: true },
      orderBy: { dueDate: "asc" },
    }) as Promise<FinancialDeadlineRow[]>,
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
    }) as Promise<FinancialRouteRow[]>,
    db.attachment.findMany({
      where: { entityType: "FinancialSubmission", entityId: { in: subIds } },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
    }) as Promise<FinancialAttachmentRow[]>,
  ]);

  const filesBySub = new Map<string, FinancialAttachmentRow[]>();
  for (const a of attachments) {
    const list = filesBySub.get(a.entityId) ?? [];
    list.push(a);
    filesBySub.set(a.entityId, list);
  }
  const routeBySub = new Map<string, FinancialRouteRow>();
  for (const r of routeRows) routeBySub.set(r.entityId, r);

  const current = submissions.filter((s) => s.academicYear === ay);

  return (
    <div className="space-y-6">
      {requirements.length === 0 ? (
        <p className="text-sm text-content-secondary">
          No financial requirements are configured yet.
        </p>
      ) : (
        requirements.map((req) => {
          const sub = current.find((s) => s.requirementId === req.id);
          return (
            <div key={req.id} className="rounded-xl border border-line p-4">
              <p className="mb-3 text-sm font-semibold text-content">
                {req.name}
                <span className="ml-2 text-xs font-normal text-content-muted">{req.code}</span>
              </p>
              <RequirementFiling
                orgId={id}
                req={req}
                sub={sub}
                status={sub ? financialSubmissionStatus(sub, routeBySub.get(sub.id)) : "UNSUBMITTED"}
                files={filesBySub}
                route={routeBySub.get(sub?.id ?? "")}
                ay={sub?.academicYear ?? ay}
                orgType={org.type}
                orgCollegeId={org.collegeId}
                deadlines={rawDeadlines}
                user={user}
                canEdit={canEdit}
                canArchive={false}
                hasAccess={hasAccess}
              />
            </div>
          );
        })
      )}
      <p className="text-xs text-content-muted">
        These are the Part 12 submissions for AY {ay}. The full workspace is at{" "}
        <Link href={`/organizations/${id}/financial`} className="font-semibold text-primary hover:underline">
          Financial compliance →
        </Link>
      </p>
    </div>
  );
}

async function ReportsBody({
  orgId,
  ay,
  reports,
}: {
  orgId: string;
  ay: string;
  reports: Awaited<ReturnType<typeof db.accomplishmentReport.findMany>>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-content-secondary">
          {reports.length > 0
            ? `${reports.length} accomplishment report${reports.length > 1 ? "s" : ""} for AY ${ay}.`
            : "No accomplishment reports have been filed for AY " + ay + "."}
        </p>
        <Link
          href={`/reports/new?org=${encodeURIComponent(orgId)}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-white hover:bg-primary-hover"
        >
          <FilePlus2 className="size-3.5" aria-hidden />
          New accomplishment report
        </Link>
      </div>
      {reports.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <Link
                  href={`/reports/${r.id}`}
                  className="truncate text-sm font-semibold text-content hover:text-primary"
                >
                  {r.title}
                </Link>
                {r.submittedAt && (
                  <p className="text-xs text-content-muted">submitted {formatDateTime(r.submittedAt)}</p>
                )}
              </div>
              <span className="text-xs font-semibold text-content-secondary">{r.status}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-content-muted">
        Reports are first-class records — an uploaded file is not required to satisfy this requirement.
      </p>
      <p className="flex items-center gap-1.5 text-xs text-content-secondary">
        <FileText className="size-3.5" aria-hidden />
        Part 12 status for this requirement derives from the highest report state.
      </p>
    </div>
  );
}