import type { Metadata } from "next";
import Link from "next/link";
import { Award, Download, Filter, Search, ChevronDown, ChevronUp } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can, scopedOrgWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import type { Recognition, RecognitionStatus } from "@/generated/prisma/client";
import { RECOGNITION_STATUS_META, REQUIREMENT_STATUS_META } from "@/lib/constants";
import { checklistForYear, compliancePct, type RequirementItem } from "@/lib/analytics";
import { getSelectedAy } from "@/lib/ay-server";
import { formatDateTime, fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TableWrap, THead, TH, TR, TD } from "@/components/ui/table";

interface ExtendedRecognition extends Recognition {
  compliance: number;
  stage: string;
  requirements: RequirementItem[];
  organization: { id: string; name: string; acronym: string | null; collegeId: string | null; college: { name: string } | null };
  signatureRoutes: Awaited<ReturnType<typeof db.signatureRoute.findMany>>;
}

export const instant = false;

export const metadata: Metadata = { title: "Accreditation Processing" };

type Search = {
  q?: string;
  status?: string;
  kind?: string;
  college?: string;
  stage?: string;
};

const STAGE_OPTIONS = [
  ["DRAFT", "Draft"],
  ["SUBMITTED", "Submitted"],
  ["UNDER_REVIEW", "Under Review"],
  ["FOR_APPROVAL", "For Approval"],
  ["FOR_SIGNATURE", "For Signature"],
  ["APPROVED", "Approved"],
  ["RECOGNIZED", "Recognized"],
  ["RETURNED", "Returned"],
  ["REJECTED", "Rejected"],
] as const;

export default async function AccreditationProcessingPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const ay = await getSelectedAy();

  // Only admins (OSAS/SOA) and DEANs can access this view
  if (!can(user, "org.manage") && user.role !== "DEAN") {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <Award className="mx-auto size-12 text-content-muted" aria-hidden />
        <h1 className="mt-4 font-display text-lg font-bold">Access Denied</h1>
        <p className="mt-2 text-sm text-content-secondary">
          This view is for OSAS, SOA, and College Deans only.
        </p>
      </Card>
    );
  }

  const where = {
    academicYear: ay,
    organization: scopedOrgWhere(user),
    ...(sp.status ? { status: sp.status as never } : {}),
    ...(sp.kind ? { kind: sp.kind as never } : {}),
    ...(sp.college ? { organization: { ...scopedOrgWhere(user), collegeId: sp.college } } : {}),
    ...(sp.q
      ? { organization: { ...scopedOrgWhere(user), name: { contains: sp.q, mode: "insensitive" as const } } }
      : {}),
  };

  const [records, colleges, taggedFiles] = await Promise.all([
    db.recognition.findMany({
      where,
      include: {
        organization: {
          select: { id: true, name: true, acronym: true, collegeId: true, college: { select: { name: true } } },
        },
        decidedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ academicYear: "desc" }, { updatedAt: "desc" }],
    }),
    db.college.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    db.attachment.findMany({
      where: { entityType: "Recognition", kind: { not: null } },
      select: { entityId: true, kind: true },
    }),
  ]);

  const recIds = records.map((r) => r.id);
  const signatureRoutes =
    recIds.length > 0
      ? await db.signatureRoute.findMany({
          where: { entityType: "Recognition", entityId: { in: recIds } },
          include: {
            steps: {
              orderBy: { order: "asc" },
              include: { signer: { select: { firstName: true, lastName: true } } },
            },
          },
        })
      : [];
  const routesByRec = new Map<string, typeof signatureRoutes>();
  for (const route of signatureRoutes) {
    const key = route.entityId;
    routesByRec.set(key, [...(routesByRec.get(key) ?? []), route]);
  }

  const kindsByRec = new Map<string, Set<string>>();
  for (const f of taggedFiles) {
    if (!kindsByRec.has(f.entityId)) kindsByRec.set(f.entityId, new Set());
    if (f.kind) kindsByRec.get(f.entityId)!.add(f.kind);
  }

  // Calculate stage for each record
  const recordsWithStage = records.map((r) => {
    const requirements = checklistForYear(
      [{ academicYear: r.academicYear, status: r.status }],
      [...(kindsByRec.get(r.id) ?? [])].map((kind) => ({ academicYear: r.academicYear, kind })),
      [],
      r.academicYear,
    );
    const compliance = compliancePct(requirements);

    // Determine current stage based on status and signature routes
    let stage: string = r.status;
    const routes = routesByRec.get(r.id) ?? [];
    const activeRoute = routes.find((sr) => sr.state === "IN_PROGRESS");
    if (activeRoute) {
      const currentStep = activeRoute.steps.find((s) => s.status === "CURRENT");
      if (currentStep) {
        stage = `${r.status} · ${currentStep.role}`;
      }
    }

    return { ...r, compliance, stage, requirements, signatureRoutes: routes } as ExtendedRecognition;
  });

  // Filter by stage if provided
  const filtered = sp.stage
    ? recordsWithStage.filter((r) => r.stage.includes(sp.stage!))
    : recordsWithStage;

  return (
    <>
      <PageHeader
        title="Accreditation Processing"
        description={`Cross-organization view for AY ${ay}. Manage all applications and renewals in one place.`}
        actions={
          can(user, "analytics.view") && (
            <>
              <a
                href="/export/recognitions"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content hover:border-primary hover:text-primary"
              >
                <Download className="size-4" aria-hidden />
                Export CSV
              </a>
              <a
                href="/export/recognitions.xlsx"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content hover:border-primary hover:text-primary"
              >
                <Download className="size-4" aria-hidden />
                Excel
              </a>
            </>
          )
        }
      />

      {/* Filters */}
      <form action="/accreditation" className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-content-secondary">
            Search Organization
          </label>
          <input
            id="q"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Organization name…"
            className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <div className="w-40">
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-content-secondary">
            Status
          </label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm">
            <option value="">All statuses</option>
            {Object.entries(RECOGNITION_STATUS_META).map(([v, m]) => (
              <option key={v} value={v}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <label htmlFor="kind" className="mb-1 block text-xs font-medium text-content-secondary">
            Type
          </label>
          <select id="kind" name="kind" defaultValue={sp.kind ?? ""} className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm">
            <option value="">All types</option>
            <option value="INITIAL">Initial</option>
            <option value="RENEWAL">Renewal</option>
          </select>
        </div>
        <div className="w-48">
          <label htmlFor="college" className="mb-1 block text-xs font-medium text-content-secondary">
            College
          </label>
          <select id="college" name="college" defaultValue={sp.college ?? ""} className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm">
            <option value="">All colleges</option>
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="w-48">
          <label htmlFor="stage" className="mb-1 block text-xs font-medium text-content-secondary">
            Current Stage
          </label>
          <select id="stage" name="stage" defaultValue={sp.stage ?? ""} className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm shadow-sm">
            <option value="">All stages</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="FOR_APPROVAL">For Approval</option>
            <option value="FOR_SIGNATURE">For Signature</option>
            <option value="APPROVED">Approved</option>
            <option value="RECOGNIZED">Recognized</option>
            <option value="RETURNED">Returned</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
        <button type="submit" className="h-10 rounded-lg bg-primary-dark px-4 text-sm font-semibold text-white hover:bg-primary">
          <Filter className="size-4 mr-1" /> Apply
        </button>
        <Link href="/accreditation" className="inline-flex h-10 items-center rounded-lg border border-line-strong px-4 text-sm font-semibold text-content-secondary hover:text-content">
          Reset
        </Link>
      </form>

      {/* Summary Cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { key: "DRAFT", label: "Draft" },
          { key: "SUBMITTED", label: "Submitted" },
          { key: "UNDER_REVIEW", label: "Under Review" },
          { key: "APPROVED", label: "Approved" },
          { key: "RECOGNIZED", label: "Recognized" },
        ].map((s) => (
          <div key={s.key} className="rounded-xl border border-line bg-background p-3 text-center">
            <p className="font-display text-2xl font-bold text-content">
              {filtered.filter((r) => r.status === s.key).length}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Award} title="No accreditation records" description="No applications match your filters or scope." />
      ) : (
        <>
          <Card className="hidden md:block">
            <TableWrap>
              <THead>
                <TH>Organization</TH>
                <TH>College</TH>
                <TH>AY</TH>
                <TH>Type</TH>
                <TH>Status</TH>
                <TH>Progress</TH>
                <TH>Current Stage</TH>
                <TH>Requirements</TH>
                <TH>Submitted</TH>
                <TH />
              </THead>
              <tbody>
                {filtered.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/recognition/${r.id}`} className="font-semibold text-primary hover:underline">
                        {r.organization.acronym ?? r.organization.name}
                      </Link>
                      {r.organization.acronym && (
                        <span className="block max-w-48 truncate text-xs text-content-secondary">{r.organization.name}</span>
                      )}
                    </TD>
                    <TD className="text-xs whitespace-nowrap text-content-secondary">
                      {r.organization.college?.name ?? "—"}
                    </TD>
                    <TD className="whitespace-nowrap tabular-nums">{r.academicYear}</TD>
                    <TD className="text-xs text-content-secondary">
                      {r.kind === "RENEWAL" ? "Renewal" : "Initial"}
                    </TD>
                    <TD>
                      <Badge tone={RECOGNITION_STATUS_META[r.status].tone}>
                        {RECOGNITION_STATUS_META[r.status].label}
                      </Badge>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2" title={`${Math.round(r.compliance)}% complete`}>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-secondary">
                          <div
                            className={`h-full rounded-full ${r.compliance === 100 ? "bg-success" : r.compliance >= 50 ? "bg-gold" : "bg-danger"}`}
                            style={{ width: `${r.compliance}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-content-secondary">{Math.round(r.compliance)}%</span>
                      </div>
                    </TD>
                    <TD className="text-xs text-content-secondary max-w-48 truncate">{r.stage}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {r.requirements.map((item) => (
                          <Badge
                            key={item.key}
                            tone={item.met ? "success" : item.status === "RETURNED" ? "orange" : item.status === "UNDER_REVIEW" ? "info" : "neutral"}
                            className="text-[10px] h-5 px-2"
                          >
                            {item.met ? "✓" : "○"} {item.label.split(" ")[0]}
                          </Badge>
                        ))}
                      </div>
                    </TD>
                    <TD className="text-xs whitespace-nowrap text-content-secondary">
                      {formatDateTime(r.submittedAt)}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Link href={`/recognition/${r.id}`} className="text-xs font-semibold text-primary hover:underline">
                          Open
                        </Link>
                        {r.organizationId && (
                          <Link
                            href={`/organizations/${r.organizationId}/accreditation`}
                            className="text-xs text-content-secondary hover:text-primary"
                          >
                            Org View
                          </Link>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          <ul className="space-y-3 md:hidden">
            {filtered.map((r) => (
              <li key={r.id}>
                <Card className="p-4">
                  <Link href={`/recognition/${r.id}`} className="block">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate font-display text-sm font-bold text-content">
                        {r.organization.acronym ?? r.organization.name}
                      </p>
                      <Badge tone={RECOGNITION_STATUS_META[r.status].tone}>
                        {RECOGNITION_STATUS_META[r.status].label}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-xs text-content-muted">
                      AY {r.academicYear} · {r.kind === "RENEWAL" ? "Renewal" : "Initial"} · {r.organization.college?.name}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-content-secondary">{Math.round(r.compliance)}% complete</span>
                      <Link href={`/recognition/${r.id}`} className="text-xs font-semibold text-primary hover:underline">
                        Open
                      </Link>
                    </div>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}