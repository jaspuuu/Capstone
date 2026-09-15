import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can, orgScopeWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { currentAcademicYear, formatDateTime } from "@/lib/utils";
import { FINANCIAL_PROCESS_LABELS, FINANCIAL_STATUS_META } from "@/lib/financial";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge, Chip } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { OrgWorkspaceNav } from "@/components/org-workspace-nav";
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

export const metadata: Metadata = { title: "Financial compliance" };

type RouteRow = FinancialRouteRow;
type AttachmentRow = FinancialAttachmentRow;

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
  // Financial compliance — internal matter; plain members cannot view it.
  if (user.role === "MEMBER") notFound();
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
    }) as Promise<FinancialRequirementRow[]>,
    loadSubmissions(org.id),
    db.deadline.findMany({
      where: { isActive: true },
      select: { id: true, name: true, isActive: true, process: true, academicYear: true, dueDate: true, scopeType: true, scopeCollegeId: true },
      orderBy: { dueDate: "asc" },
    }) as Promise<FinancialDeadlineRow[]>,
  ]);

  const subIds = (submissions as FinancialSubmissionRow[]).map((s) => s.id);
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

  const statusOf = (s: FinancialSubmissionRow) =>
    financialSubmissionStatus(s, routeBySub.get(s.id));

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

      <OrgWorkspaceNav orgId={org.id} active="finance" />

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