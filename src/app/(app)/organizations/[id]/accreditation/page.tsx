import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  FileText,
  CheckCircle2,
  CircleDashed,
  AlertCircle,
  ArrowRight,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileStack,
  Search,
  ExternalLink,
} from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can, orgScopeWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import {
  RECOGNITION_STATUS_META,
  REQUIREMENT_STATUS_META,
  ORG_APPLICATION_STATUS_META,
} from "@/lib/constants";
import { checklistForYear, compliancePct, requirementLabel, type RequirementItem } from "@/lib/analytics";
import { currentAcademicYear, formatDateTime, fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { WorkflowTracker } from "@/components/ui/workflow-tracker";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";
import { ActionForm, QuickActionForm } from "@/components/action-form";
import {
  createRecognition,
  submitRecognition,
} from "@/lib/actions/recognition";
import { getRouteWithSteps } from "@/lib/signature-routing";
import { sfRouteEntityId } from "@/lib/form-routes";
import { RequirementStatusChip } from "@/components/accreditation/requirement-status-chip";
import { DocumentLocationTracker } from "@/components/accreditation/document-location-tracker";
import { SubmissionValidationGate } from "@/components/accreditation/submission-validation-gate";

export const instant = false;

export const metadata: Metadata = { title: "Accreditation" };

function getRecognitionForYear(orgId: string, ay: string) {
  return db.recognition.findFirst({
    where: { organizationId: orgId, academicYear: ay },
    include: {
      organization: {
        include: {
          college: true,
          members: {
            where: { isCurrent: true },
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
            orderBy: { position: "asc" },
          },
          advisers: {
            where: { isCurrent: true },
            include: { adviser: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
          },
        },
      },
      events: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { firstName: true, lastName: true } } },
      },
      decidedBy: { select: { firstName: true, lastName: true } },
    },
  });
}

// Attach the live SF-001 signature route for this recognition so the submission
// gate can ENFORCE that every signatory has signed before the application is
// submitted. Reads the real routed workflow (never a stored snapshot).
type GateSignatureRoute = {
  formKey: string;
  state: string;
  steps: {
    order: number;
    role: string;
    status: "LOCKED" | "CURRENT" | "SIGNED" | "RETURNED" | "REJECTED";
    signedAt: string | null;
    signer: { firstName: string; lastName: string } | null;
  }[];
};

async function withSignatureRoutes(
  rec: Awaited<ReturnType<typeof getRecognitionForYear>>
): Promise<Awaited<ReturnType<typeof getRecognitionForYear>> & { signatureRoutes: any }> {
  if (!rec) return rec as never;
  const route = await getRouteWithSteps("SF", sfRouteEntityId("SF001", rec.organizationId, rec.academicYear));
  // Always attach the route when one exists — even with zero steps — so the
  // gate treats "recognized route, not fully signed" as blocking, while a
  // recognition with no route at all stays unblocked.
  const signatureRoutes: GateSignatureRoute[] = route
    ? [
        {
          formKey: "SF001",
          state: route.state,
          steps: route.steps.map((s) => ({
            order: s.order,
            role: s.role,
            status: s.status,
            signedAt: s.signedAt ? s.signedAt.toISOString() : null,
            signer: s.signer ? { firstName: s.signer.firstName, lastName: s.signer.lastName } : null,
          })),
        },
      ]
    : [];
  // Gate consumers type `signatureRoutes` more strictly (SignatoryRole +
  // optional fields) than this server-built shape; the runtime data matches,
  // so cast to satisfy both at the call sites.
  return { ...rec, signatureRoutes: signatureRoutes as any };
}

async function getRequirements(rec: any, ay: string): Promise<RequirementItem[]> {
  const [attachments, reports, financialSubmissions] = await Promise.all([
    db.attachment.findMany({
      where: { entityType: "Recognition", entityId: rec.id },
      select: { kind: true },
    }),
    db.accomplishmentReport.findMany({
      where: { organizationId: rec.organizationId, academicYear: ay },
      select: { academicYear: true, status: true },
    }),
    db.financialSubmission.findMany({
      where: { organizationId: rec.organizationId, academicYear: ay },
      select: { academicYear: true, status: true },
    }),
  ]);

  return checklistForYear(
    [{ academicYear: rec.academicYear, status: rec.status }],
    attachments
      .filter((a) => a.kind !== null)
      .map((a) => ({ academicYear: ay, kind: a.kind! })),
    reports,
    ay,
    financialSubmissions,
  );
}

export default async function AccreditationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const ay = currentAcademicYear();

  const org = await db.organization.findFirst({
    where: { AND: [orgScopeWhere(user), { id }] },
    select: {
      id: true,
      name: true,
      acronym: true,
      description: true,
      type: true,
      collegeId: true,
      applicationStatus: true,
      recognitions: {
        select: { id: true, academicYear: true, kind: true, status: true },
        orderBy: { academicYear: "desc" },
      },
    },
  });
  if (!org) notFound();

  const isOfficer =
    (user.role === "PRESIDENT" || user.role === "SECRETARY") &&
    org.recognitions.some((r) => r.academicYear === ay);

  const currentRecognition = org.recognitions.find((r) => r.academicYear === ay);
  const prevRecognition = org.recognitions.find((r) => r.academicYear !== ay && ["APPROVED", "RECOGNIZED"].includes(r.status));
  const canCreate = can(user, "recognition.submit") && !currentRecognition;
  const canSubmit = can(user, "recognition.submit") && currentRecognition && ["DRAFT", "RETURNED"].includes(currentRecognition.status);

  let activeRec = null;
  let requirements: RequirementItem[] = [];
  let compliance = 0;
  let nextAction = null;

  if (currentRecognition) {
    activeRec = await withSignatureRoutes(await getRecognitionForYear(id, ay));
    if (activeRec) {
      requirements = await getRequirements(activeRec, ay);
      compliance = compliancePct(requirements);
      const incompleteReqs = requirements.filter((r) => !r.met);
      if (incompleteReqs.length > 0) {
        nextAction = {
          label: `Complete: ${incompleteReqs[0].label}`,
          href: `/organizations/${id}/accreditation/forms/${incompleteReqs[0].key}`,
        };
      } else if (["DRAFT", "RETURNED"].includes(activeRec.status)) {
        nextAction = { label: "Submit application", href: "#submit-action" };
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Organization Accreditation"
        description={`${org.name} · ${org.acronym ?? "—"}`}
        breadcrumb={[
          { label: "Organizations", href: "/organizations" },
          { label: org.acronym ?? org.name, href: `/organizations/${id}` },
          { label: "Accreditation" },
        ]}
        actions={
          <>
            {canCreate && (
              <Link
                href={`/recognition/new?organizationId=${id}&kind=INITIAL`}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
              >
                <Award className="size-4" aria-hidden />
                New Application
              </Link>
            )}
            {prevRecognition && !currentRecognition && can(user, "recognition.submit") && (
              <Link
                href={`/recognition/new?organizationId=${id}&kind=RENEWAL`}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-gold px-4 text-sm font-semibold text-primary-dark shadow-sm hover:bg-gold-dark hover:text-white"
              >
                <RefreshCw className="size-4" aria-hidden />
                Start Renewal
              </Link>
            )}
          </>
        }
      />

      {/* Status Header Card */}
      <Card className="mb-6">
        <CardContent className="py-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Org Info */}
            <div className="md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted mb-2">
                {currentRecognition ? "Active Process" : prevRecognition ? "Renewal Available" : "No Active Process"}
              </p>
              <h2 className="font-display text-2xl font-bold text-content">
                {currentRecognition
                  ? `${currentRecognition.kind === "RENEWAL" ? "Renewal" : "Application"} — AY ${ay}`
                  : prevRecognition
                  ? `Ready for Renewal — AY ${ay}`
                  : "Initial Application Required"}
              </h2>
              <p className="mt-1 text-sm text-content-secondary">
                {currentRecognition
                  ? `${RECOGNITION_STATUS_META[currentRecognition.status].label} · ${ORG_APPLICATION_STATUS_META[activeRec?.status ?? "DRAFT"]?.label ?? "Draft"}`
                  : prevRecognition
                  ? `Previous recognition: AY ${prevRecognition.academicYear} (${RECOGNITION_STATUS_META[prevRecognition.status].label})`
                  : "This organization has not yet filed for recognition."}
              </p>
            </div>

            {/* Progress */}
            <div className="flex flex-col items-end md:items-end">
              <div className="w-48 h-48 relative">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="96"
                    cy="96"
                    r="80"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-line"
                  />
                  <circle
                    cx="96"
                    cy="96"
                    r="80"
                    fill="none"
                    strokeWidth="8"
                    strokeDasharray={`${(compliance / 100) * 502.65} 502.65`}
                    strokeLinecap="round"
                    className={compliance === 100 ? "text-success" : compliance >= 50 ? "text-gold" : "text-danger"}
                    style={{ transition: "stroke-dasharray 0.5s ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-display text-3xl font-bold text-content">{compliance}%</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-center text-content-secondary">
                {currentRecognition
                  ? `${requirements.filter((r) => r.met).length} of ${requirements.length} requirements complete`
                  : prevRecognition
                  ? "Ready to start renewal"
                  : "No requirements started"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Next Action Card */}
      {nextAction && (
        <Card className="mb-6 border-primary/30 bg-primary-light/10">
          <CardContent className="py-4 px-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <ArrowRight className="size-5 text-primary" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-content">Next Action</p>
                  <p className="text-xs text-content-secondary">{nextAction.label}</p>
                </div>
              </div>
              {nextAction.href !== "#submit-action" && (
                <Link
                  href={nextAction.href}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
                >
                  Continue
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Workflow Tracker */}
      {activeRec && (
        <Card className="mb-6">
          <CardHeader
            icon={FileStack}
            title={activeRec.kind === "RENEWAL" ? "Renewal Process" : "Application Process"}
            description="Current position in the official workflow."
          />
          <CardContent className="py-2">
            <WorkflowTracker
              process={activeRec.kind === "RENEWAL" ? "RENEWAL" : "RECOGNITION"}
              status={activeRec.status}
            />
          </CardContent>
        </Card>
      )}

      {/* Requirements Center */}
      {activeRec && requirements.length > 0 && (
        <Card className="mb-6">
          <CardHeader
            icon={FileText}
            title={`Requirements Center · AY ${ay}`}
            description={`${requirements.filter((r) => r.met).length}/${requirements.length} complete`}
          />
          <CardContent>
            <div className="space-y-2 mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-secondary">
                Required
              </p>
              <ul className="divide-y divide-line">
                {requirements.map((item) => (
                  <li key={item.key} className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <RequirementStatusChip met={item.met} status={item.status} />
                      <span className="text-sm font-medium text-content">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={REQUIREMENT_STATUS_META[item.status].tone}>
                        {REQUIREMENT_STATUS_META[item.status].label}
                      </Badge>
                      {item.met ? (
                        <span className="text-xs text-content-muted">Complete</span>
                      ) : (
                        <Link
                          href={`/organizations/${id}/accreditation/forms/${item.key}`}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Complete
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Conditional Requirements Notice */}
            <div className="rounded-lg border border-line bg-surface-secondary/60 p-3 text-xs text-content-secondary">
              <p className="font-semibold text-content mb-1">Conditional Requirements</p>
              <p>
                Financial Report is required only if the organization has financial activity. The system will not block
                submission for conditional items unless institutional rules make them mandatory.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document Location Tracker */}
      {activeRec && (
        <Card className="mb-6">
          <CardHeader
            icon={Search}
            title="Document Location"
            description="Where is the application in the signature chain?"
          />
          <CardContent>
            <DocumentLocationTracker
              recognition={activeRec}
              requirements={requirements}
            />
          </CardContent>
        </Card>
      )}

      {/* Submission Validation Gate */}
      {activeRec && ["DRAFT", "RETURNED"].includes(activeRec.status) && isOfficer && (
        <Card className="mb-6">
          <CardHeader icon={CheckCircle2} title="Ready to Submit?" />
          <CardContent>
            <SubmissionValidationGate
              recognition={activeRec}
              requirements={requirements}
              organizationId={id}
            />
          </CardContent>
        </Card>
      )}

      {/* Accreditation History */}
      <Card>
        <CardHeader
          icon={Clock}
          title="Accreditation History"
          description="All previous cycles are preserved for audit and reference."
        />
        <CardContent>
          {org.recognitions.length === 0 ? (
            <EmptyState
              icon={Award}
              title="No accreditation history"
              description="This organization has not filed for recognition yet."
            />
          ) : (
            <TableWrap>
              <THead>
                <TH>Academic Year</TH>
                <TH>Type</TH>
                <TH>Status</TH>
                <TH>Progress</TH>
                <TH>Submitted</TH>
                <TH>Decided</TH>
                <TH />
              </THead>
              <tbody>
                {org.recognitions.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap">{r.academicYear}</TD>
                    <TD className="text-xs text-content-secondary">
                      {r.kind === "RENEWAL" ? "Renewal" : "Initial"}
                    </TD>
                    <TD>
                      <Badge tone={RECOGNITION_STATUS_META[r.status].tone}>
                        {RECOGNITION_STATUS_META[r.status].label}
                      </Badge>
                    </TD>
                    <TD>
                      {r.id && (
                        <>
                          {currentRecognition?.id === r.id ? (
                            <span className="text-xs font-medium text-primary">{compliance}%</span>
                          ) : (
                            <span className="text-xs text-content-muted">Archived</span>
                          )}
                        </>
                      )}
                    </TD>
                    <TD className="text-xs whitespace-nowrap text-content-secondary">
                      {formatDateTime(r.status === "DRAFT" ? null : new Date())}
                    </TD>
                    <TD className="text-xs whitespace-nowrap text-content-secondary">
                      {formatDateTime(r.status === "RECOGNIZED" ? new Date() : null)}
                    </TD>
                    <TD>
                      <Link
                        href={`/recognition/${r.id}`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Open
                      </Link>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
          )}
        </CardContent>
      </Card>
    </>
  );
}