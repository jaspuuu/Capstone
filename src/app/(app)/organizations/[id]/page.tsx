import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  FileStack,
  GraduationCap,
  Landmark,
  Network,
  Pencil,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { can, orgScopeWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import {
  ADVISER_TYPE_LABELS,
  MEMBER_POSITION_LABELS,
  MEMBERSHIP_STATUS_META,
  ORG_APPLICATION_STATUS_META,
  ORG_STATE_META,
  ORG_TYPE_LABELS,
  RECOGNITION_STATUS_META,
} from "@/lib/constants";
import { deriveOrgState, ORG_APPLICATION_STEPS, orgApplicationStepIndex } from "@/lib/org-state";
import { currentAcademicYear, formatDate, fullName } from "@/lib/utils";import { Badge, Chip } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Field, Select, Textarea } from "@/components/ui/form";
import { WorkflowSteps } from "@/components/ui/progress";
import { ActionForm, QuickActionForm } from "@/components/action-form";
import {
  addMember,
  applyForMembership,
  assignAdviser,
  decideMembership,
  deactivateMembership,
  endAdviserTerm,
  removeMember,
  reviewMembership,
  setMemberPosition,
  setOrganizationStatus,
  submitOrgApplication,
  startOrgReview,
  adviserApproveApplication,
  deanApproveApplication,
  soaApproveApplication,
  conferOrgApplication,
  returnOrgApplication,
  rejectOrgApplication,
} from "@/lib/actions/organizations";
import { MemberPicker } from "@/app/(app)/organizations/[id]/member-picker";

export const metadata: Metadata = { title: "Organization profile" };

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // Scope check: the where clause guarantees users only reach their own orgs.
  const org = await db.organization.findFirst({
    where: { AND: [orgScopeWhere(user), { id }] },
    include: {
      college: true,
      department: true,
      parent: { select: { id: true, name: true, acronym: true } },
      children: { where: { archivedAt: null }, select: { id: true, name: true, acronym: true, status: true } },
      advisers: {
        where: { isCurrent: true },
        include: { adviser: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: [{ academicYear: "desc" }, { type: "asc" }],
      },
      members: {
        where: { isCurrent: true },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: [{ academicYear: "desc" }, { position: "asc" }],
      },
      recognitions: {
        orderBy: { academicYear: "desc" },
        include: { events: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
    },
  });
  if (!org) notFound();

  const ay = currentAcademicYear();
  const state = deriveOrgState(org, org.recognitions);
  const canManage = can(user, "org.manage");
  const isEstablished = org.applicationStatus === "RECOGNIZED";
  const isOfficer =
    user.role === "PRESIDENT" || user.role === "SECRETARY"
      ? org.members.some(
          (m) =>
            m.userId === user.id &&
            m.academicYear === ay &&
            (m.position === "PRESIDENT" || m.position === "SECRETARY")
        )
      : false;
  const canManageMembers = canManage || isOfficer;

  const currentAdvisers = org.advisers.filter((a) => a.academicYear === ay);
  const pastAdvisers = org.advisers
    .filter((a) => !a.isCurrent)
    .sort((x, y) => (y.endedAt?.getTime() ?? 0) - (x.endedAt?.getTime() ?? 0));
  const currentMembers = org.members.filter((m) => m.academicYear === ay);
  // §8 profile facts: current senior adviser and President, shown in the header.
  const seniorAdviser = currentAdvisers.find((a) => a.type === "REGULAR" && a.isCurrent);
  const president = currentMembers.find(
    (m) => m.position === "PRESIDENT" && ["ACTIVE", "APPROVED"].includes(m.status)
  );
  const appliedMembers = currentMembers.filter((m) => m.status === "APPLIED");
  const approvedMembers = currentMembers.filter((m) => ["ACTIVE", "APPROVED"].includes(m.status));
  const myMembership = currentMembers.find((m) => m.userId === user.id);
  const canApply =
    !myMembership &&
    ["MEMBER", "PRESIDENT", "SECRETARY"].includes(user.role) &&
    org.status === "ACTIVE" &&
    isEstablished;
  const currentRec = org.recognitions.find((r) => r.academicYear === ay);
  const hasPriorRecognition = org.recognitions.some((r) =>
    ["APPROVED", "RECOGNIZED"].includes(r.status)
  );

  // ---- §5 application workflow ---------------------------------------------
  const hasSeniorAdviser = currentAdvisers.some((a) => a.type === "REGULAR" && a.isCurrent);
  const isBoundSeniorAdviser =
    user.role === "ADVISER_REGULAR" &&
    currentAdvisers.some((a) => a.type === "REGULAR" && a.isCurrent && a.adviserId === user.id);
  const appReviewerRole =
    org.applicationStatus === "SUBMITTED" || org.applicationStatus === "UNDER_REVIEW"
      ? ("ADVISER" as const)
      : org.applicationStatus === "FOR_SIGNATURE"
        ? ("DEAN" as const)
        : org.applicationStatus === "FOR_APPROVAL"
          ? ("SOA" as const)
          : org.applicationStatus === "APPROVED"
            ? ("OSAS" as const)
            : null;
  const canReviewApp =
    (appReviewerRole === "ADVISER" && isBoundSeniorAdviser) ||
    (appReviewerRole === "DEAN" && user.role === "DEAN") ||
    (appReviewerRole === "SOA" && user.role === "SOA") ||
    (appReviewerRole === "OSAS" && user.role === "OSAS");
  const canOfficerEdit =
    !isEstablished && (org.applicationStatus === "DRAFT" || org.applicationStatus === "RETURNED");

  const [adviserPool, studentPool] = canManage
    ? await Promise.all([
        db.user.findMany({
          where: { isActive: true, role: { in: ["ADVISER_REGULAR", "ADVISER_PARTTIME"] } },
          select: { id: true, firstName: true, lastName: true, role: true },
          orderBy: { lastName: "asc" },
        }),
        db.user.findMany({
          where: { isActive: true, role: { in: ["MEMBER", "PRESIDENT", "SECRETARY"] } },
          select: { id: true, firstName: true, lastName: true },
          orderBy: { lastName: "asc" },
          take: 500,
        }),
      ])
    : [[], []];

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-2 text-xs text-content-muted">
            <Link href="/organizations" className="font-medium hover:text-primary hover:underline">
              Organizations
            </Link>
            <span aria-hidden> / </span>
            <span className="font-medium text-content-secondary">{org.acronym ?? org.name}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            {org.logoStoredName ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/logo/${org.id}`}
                alt={`${org.name} logo`}
                className="size-12 rounded-xl border border-line object-cover"
              />
            ) : null}
            <h1 className="font-display text-2xl font-bold tracking-tight text-content">
              {org.name}
            </h1>
            <Badge tone={ORG_STATE_META[state].tone}>{ORG_STATE_META[state].label}</Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-content-secondary">
            <span>{org.college.name}</span>
            {org.department && (
              <>
                <span aria-hidden>·</span>
                <span>{org.department.name}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <Chip>{ORG_TYPE_LABELS[org.type]}</Chip>
            {org.foundedYear && (
              <>
                <span aria-hidden>·</span>
                <Chip>
                  <CalendarDays className="size-3" aria-hidden /> Est. {org.foundedYear}
                </Chip>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isOfficer && isEstablished && !currentRec && (
            <Link
              href={`/recognition/new?organizationId=${org.id}&kind=${hasPriorRecognition ? "RENEWAL" : "INITIAL"}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
            >
              {hasPriorRecognition ? (
                <><RefreshCw className="size-4" aria-hidden /> Start renewal</>
              ) : (
                <><Award className="size-4" aria-hidden /> Apply for recognition</>
              )}
            </Link>
          )}
          {isOfficer && currentRec && ["DRAFT", "RETURNED"].includes(currentRec.status) && (
            <Link
              href={`/recognition/${currentRec.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-gold px-4 text-sm font-semibold text-primary-dark shadow-sm hover:bg-gold-dark hover:text-white"
            >
              Complete submission
            </Link>
          )}
          <Link
            href={`/organizations/${org.id}/documents`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-content hover:border-primary"
          >
            <FileStack className="size-4" aria-hidden />
            Documents
          </Link>
          <a
            href={`/forms/sf-004?org=${org.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-content hover:border-primary"
          >
            SF-004 Plan of Activities
          </a>
          {(canManage || (isOfficer && canOfficerEdit)) && (
            <>
              <Link
                href={`/organizations/${org.id}/edit`}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-content hover:border-primary"
              >
                <Pencil className="size-4" aria-hidden />
                Edit
              </Link>
              {canManage && (
                <QuickActionForm
                  action={setOrganizationStatus}
                  hidden={{ id: org.id, status: org.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }}
                  label={org.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                  confirmMessage={
                    org.status === "ACTIVE"
                      ? "Deactivate this organization? Historical records are preserved and the organization becomes view-only."
                      : "Reactivate this organization?"
                  }
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* §8 profile facts at a glance — recognition period, senior adviser, president */}
      <dl className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
        {(isEstablished || currentRec) && (
          <div className="bg-surface px-4 py-3">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-content-muted">
              Recognition · AY {ay}
            </dt>
            <dd className="mt-1">
              {currentRec ? (
                <Link
                  href={`/recognition/${currentRec.id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-content hover:text-primary"
                >
                  {RECOGNITION_STATUS_META[currentRec.status].label}
                  <ArrowRight className="size-3.5 text-content-muted" aria-hidden />
                </Link>
              ) : (
                <span className="text-sm text-content-secondary">Not filed for AY {ay}</span>
              )}
            </dd>
          </div>
        )}
        <div className="bg-surface px-4 py-3">
          <dt className="text-[11px] font-bold uppercase tracking-wide text-content-muted">
            Senior Adviser
          </dt>
          <dd className="mt-1">
            {seniorAdviser ? (
              <span className="text-sm font-semibold text-content">{fullName(seniorAdviser.adviser)}</span>
            ) : (
              <span className="text-sm text-content-muted">Not assigned</span>
            )}
          </dd>
        </div>
        <div className="bg-surface px-4 py-3">
          <dt className="text-[11px] font-bold uppercase tracking-wide text-content-muted">
            President
          </dt>
          <dd className="mt-1">
            {president ? (
              <span className="text-sm font-semibold text-content">{fullName(president.user)}</span>
            ) : (
              <span className="text-sm text-content-muted">No officer yet</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          {/* §5: Organization application — created by the President, reviewed
              through the adviser → dean → SOA → OSAS chain before the
              organization is recognized. */}
          {!isEstablished && (
            <Card>
              <CardHeader
                icon={ClipboardList}
                title="Organization application"
                description="Created and completed by the President. It passes through Senior Adviser → Dean → SOA → OSAS reviews before recognition is granted."
              />
              <CardContent className="space-y-4">
                {org.applicationStatus === "RETURNED" || org.applicationStatus === "REJECTED" ? (
                  <Alert
                    tone={org.applicationStatus === "REJECTED" ? "danger" : "warning"}
                    title={
                      org.applicationStatus === "REJECTED"
                        ? "Application disapproved"
                        : "Revision required"
                    }
                  >
                    {org.applicationRemark
                      ? org.applicationRemark
                      : "The reviewer did not leave a note."}
                  </Alert>
                ) : (
                  <WorkflowSteps
                    steps={ORG_APPLICATION_STEPS}
                    currentIndex={orgApplicationStepIndex(org)}
                  />
                )}

                {/* President / Secretary — complete and file the application */}
                {isOfficer && canOfficerEdit && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    <Link
                      href={`/organizations/${org.id}/edit`}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-semibold text-content hover:border-primary"
                    >
                      <Pencil className="size-4" aria-hidden />
                      Edit application
                    </Link>
                    <ActionForm
                      action={submitOrgApplication}
                      submitLabel="Submit for review"
                      variant="primary"
                      footerClassName="mt-0"
                    >
                      <input type="hidden" name="id" value={org.id} />
                    </ActionForm>
                    {org.applicationStatus === "DRAFT" && !hasSeniorAdviser && (
                      <p className="w-full text-xs font-medium text-warning">
                        Assign a Senior Adviser first — the application cannot be submitted until a
                        Regular Faculty adviser is assigned.
                      </p>
                    )}
                  </div>
                )}

                {/* Reviewer — advance, return, or reject the application */}
                {canReviewApp && (
                  <div className="border-t border-line pt-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-content-muted">
                      Your review ·{" "}
                      {ORG_APPLICATION_STATUS_META[org.applicationStatus]?.label ??
                        org.applicationStatus}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {appReviewerRole === "ADVISER" && org.applicationStatus === "SUBMITTED" && (
                        <ActionForm
                          action={startOrgReview}
                          submitLabel="Start review"
                          variant="primary"
                          footerClassName="mt-0"
                        >
                          <input type="hidden" name="id" value={org.id} />
                        </ActionForm>
                      )}
                      {appReviewerRole === "ADVISER" && org.applicationStatus === "UNDER_REVIEW" && (
                        <ActionForm
                          action={adviserApproveApplication}
                          submitLabel="Approve & forward to Dean"
                          variant="primary"
                          footerClassName="mt-0"
                        >
                          <input type="hidden" name="id" value={org.id} />
                        </ActionForm>
                      )}
                      {appReviewerRole === "DEAN" && (
                        <ActionForm
                          action={deanApproveApplication}
                          submitLabel="Approve & forward to SOA"
                          variant="primary"
                          footerClassName="mt-0"
                        >
                          <input type="hidden" name="id" value={org.id} />
                        </ActionForm>
                      )}
                      {appReviewerRole === "SOA" && (
                        <ActionForm
                          action={soaApproveApplication}
                          submitLabel="Approve & recommend to OSAS"
                          variant="primary"
                          footerClassName="mt-0"
                        >
                          <input type="hidden" name="id" value={org.id} />
                        </ActionForm>
                      )}
                      {appReviewerRole === "OSAS" && (
                        <>
                          <ActionForm
                            action={conferOrgApplication}
                            submitLabel="Confer recognition"
                            variant="gold"
                            footerClassName="mt-0"
                          >
                            <input type="hidden" name="id" value={org.id} />
                          </ActionForm>
                          <ActionForm
                            action={rejectOrgApplication}
                            submitLabel="Reject application"
                            variant="danger"
                            footerClassName="mt-0"
                          >
                            <input type="hidden" name="id" value={org.id} />
                            <Field label="Reason for rejection" htmlFor={`org-reject-${org.id}`}>
                              <Textarea
                                id={`org-reject-${org.id}`}
                                name="note"
                                required
                                rows={2}
                                placeholder="Required — this is shown to the President."
                              />
                            </Field>
                          </ActionForm>
                        </>
                      )}

                      {/* Every reviewer may send it back for revision. */}
                      <details className="rounded-lg border border-dashed border-line-strong px-3 py-2">
                        <summary className="cursor-pointer text-xs font-semibold text-content-secondary">
                          Return for revision…
                        </summary>
                        <ActionForm
                          action={returnOrgApplication}
                          submitLabel="Return for revision"
                          variant="outline"
                          footerClassName="mt-2"
                          className="mt-3 space-y-3"
                        >
                          <input type="hidden" name="id" value={org.id} />
                          <Field label="Reason" htmlFor={`org-return-${org.id}`}>
                            <Textarea
                              id={`org-return-${org.id}`}
                              name="note"
                              required
                              rows={3}
                              placeholder="What the President should revise before resubmitting…"
                            />
                          </Field>
                        </ActionForm>
                      </details>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {org.description && (
            <Card>
              <CardHeader icon={Landmark} title="About" />
              <CardContent className="text-sm leading-relaxed whitespace-pre-wrap text-content-secondary">
                {org.description}
              </CardContent>
            </Card>
          )}

          {/* Advisers */}
          <Card>
            <CardHeader
              icon={GraduationCap}
              title={`Advisers · AY ${ay}`}
              description="Regular and part-time faculty advisers are maintained separately."
            />
            <CardContent className="space-y-3">
              {(["REGULAR", "PART_TIME"] as const).map((t) => {
                const a = currentAdvisers.find((x) => x.type === t && x.isCurrent);
                return (
                  <div
                    key={t}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-background px-4 py-3"
                  >
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-content-muted">
                        {ADVISER_TYPE_LABELS[t]}
                      </p>
                      {a ? (
                        <>
                          <p className="mt-0.5 text-sm font-semibold text-content">
                            {fullName(a.adviser)}
                          </p>
                          <p className="text-xs text-content-secondary">{a.adviser.email}</p>
                        </>
                      ) : (
                        <p className="mt-0.5 text-sm text-content-muted">Not assigned</p>
                      )}
                    </div>
                    {a && canManage && (
                      <QuickActionForm
                        action={endAdviserTerm}
                        hidden={{ assignmentId: a.id }}
                        label="End term"
                        variant="ghost"
                        confirmMessage={`End ${fullName(a.adviser)}'s term as ${ADVISER_TYPE_LABELS[t]}? The record is kept in the adviser history.`}
                      />
                    )}
                  </div>
                );
              })}

              {/* §20: past terms are permanent history, never deleted. */}
              {pastAdvisers.length > 0 && (
                <details className="rounded-lg border border-line px-4 py-3">
                  <summary className="cursor-pointer text-xs font-semibold text-content-secondary">
                    Past adviser terms ({pastAdvisers.length})
                  </summary>
                  <ul className="mt-2 divide-y divide-line">
                    {pastAdvisers.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-content">{fullName(a.adviser)}</p>
                          <p className="text-xs text-content-secondary">
                            {ADVISER_TYPE_LABELS[a.type]} · AY {a.academicYear}
                            {a.endedAt ? ` · ended ${formatDate(a.endedAt)}` : ""}
                          </p>
                        </div>
                        {a.endReason && (
                          <Chip className="capitalize">{a.endReason.replaceAll("_", " ").toLowerCase()}</Chip>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {canManage && (
                <details className="rounded-lg border border-dashed border-line-strong px-4 py-3">
                  <summary className="cursor-pointer text-xs font-semibold text-primary">
                    <UserPlus className="mr-1 inline size-3.5" aria-hidden />
                    Assign / succeed an adviser for AY {ay}
                  </summary>
                  <p className="mt-2 text-xs text-content-secondary">
                    Assigning into an occupied position ends the current adviser&rsquo;s term — the record stays in the history above.
                  </p>
                  <ActionForm
                    action={assignAdviser}
                    submitLabel="Assign adviser"
                    footerClassName="mt-3"
                    className="mt-3 space-y-3"
                  >
                    <input type="hidden" name="organizationId" value={org.id} />
                    <input type="hidden" name="academicYear" value={ay} />
                    <Field label="Position" htmlFor="adv-type">
                      <Select id="adv-type" name="type" required defaultValue="">
                        <option value="" disabled>
                          Select position…
                        </option>
                        <option value="REGULAR">Regular Faculty Adviser</option>
                        <option value="PART_TIME">Part-Time Faculty Adviser</option>
                      </Select>
                    </Field>
                    <Field label="Faculty adviser" htmlFor="adv-user">
                      <Select id="adv-user" name="adviserId" required defaultValue="">
                        <option value="" disabled>
                          Select adviser account…
                        </option>
                        {adviserPool.map((u) => (
                          <option key={u.id} value={u.id}>
                            {fullName(u)} — {u.role === "ADVISER_REGULAR" ? "Senior" : "Junior"}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </ActionForm>
                </details>
              )}
            </CardContent>
          </Card>

          {/* Members */}
          <Card>
            <CardHeader
              icon={Users}
              title={`Officers & members · AY ${ay}`}
              description={`${approvedMembers.length} registered for the current academic year.`}
            />
            <CardContent>
              {/* Pending applications awaiting officer review (§15) */}
              {canManageMembers && appliedMembers.length > 0 && (
                <div className="mb-4 rounded-lg border border-warning/30 bg-warning-light/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-warning">
                    Pending applications ({appliedMembers.length})
                  </p>
                  <ul className="mt-2 divide-y divide-warning/15">
                    {appliedMembers.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-content">{fullName(m.user)}</p>
                          <p className="truncate text-xs text-content-secondary">{m.user.email}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <QuickActionForm
                            action={reviewMembership}
                            hidden={{ membershipId: m.id }}
                            label="Review"
                            variant="primary"
                          />
                          <QuickActionForm
                            action={decideMembership}
                            hidden={{ membershipId: m.id, decision: "APPROVED" }}
                            label="Approve"
                            variant="primary"
                          />
                          <QuickActionForm
                            action={decideMembership}
                            hidden={{ membershipId: m.id, decision: "REJECTED" }}
                            label="Reject"
                            variant="ghost"
                            confirmMessage={`Reject ${fullName(m.user)}'s application?`}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {approvedMembers.length === 0 ? (
                <p className="text-sm text-content-muted">No registered members yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {approvedMembers.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-light font-display text-[11px] font-bold text-primary">
                          {m.user.firstName.charAt(0)}
                          {m.user.lastName.charAt(0)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-content">
                            {fullName(m.user)}
                            {m.userId === user.id && (
                              <span className="ml-1.5 text-xs font-medium text-gold-dark">(you)</span>
                            )}
                          </p>
                          <p className="truncate text-xs text-content-secondary">{m.user.email}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={MEMBERSHIP_STATUS_META[m.status]?.tone ?? "neutral"}>
                          {MEMBERSHIP_STATUS_META[m.status]?.label ?? m.status}
                        </Badge>
                        <Chip>{MEMBER_POSITION_LABELS[m.position]}</Chip>
                        {canManageMembers && m.status === "ACTIVE" && (
                          <>
                            {/* §24: promote/demote inline — one President and
                                one Secretary per year are enforced server-side. */}
                            <form action={setMemberPosition} className="flex items-center gap-1">
                              <input type="hidden" name="membershipId" value={m.id} />
                              <label className="sr-only" htmlFor={`pos-${m.id}`}>
                                Position for {fullName(m.user)}
                              </label>
                              <select
                                id={`pos-${m.id}`}
                                name="position"
                                defaultValue={m.position}
                                className="h-7 rounded-md border border-line-strong bg-surface px-1.5 text-xs"
                              >
                                <option value="MEMBER">Member</option>
                                <option value="PRESIDENT">President</option>
                                <option value="SECRETARY">Secretary</option>
                              </select>
                              <button
                                type="submit"
                                className="h-7 rounded-md border border-line-strong px-2 text-xs font-semibold text-content hover:border-primary hover:text-primary"
                              >
                                Set
                              </button>
                            </form>
                            <QuickActionForm
                              action={deactivateMembership}
                              hidden={{ membershipId: m.id }}
                              label="Deactivate"
                              variant="ghost"
                              confirmMessage={`Deactivate ${fullName(m.user)}'s membership?`}
                            />
                          </>
                        )}
                        {canManageMembers && m.status === "ACTIVE" && (
                          <QuickActionForm
                            action={removeMember}
                            hidden={{ membershipId: m.id }}
                            label="Remove"
                            variant="ghost"
                            confirmMessage={`Remove ${fullName(m.user)} from this organization?`}
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Student self-service application (§14-§15): students keep one
                  account across organizations; each membership is per org-year. */}
              {myMembership?.status === "APPLIED" && (
                <p className="mt-4 rounded-lg bg-warning-light px-3 py-2 text-sm text-warning" role="status">
                  Your membership application is awaiting officer review.
                </p>
              )}
              {myMembership?.status === "REJECTED" && (
                <p className="mt-4 rounded-lg bg-danger-light px-3 py-2 text-sm text-danger" role="status">
                  Your previous application was not approved.
                </p>
              )}
              {canApply && (
                <details className="mt-4 rounded-lg border border-dashed border-line-strong px-4 py-3">
                  <summary className="cursor-pointer text-xs font-semibold text-primary">Apply to join this organization</summary>
                  <ActionForm action={applyForMembership} submitLabel="Submit application" footerClassName="mt-3" className="mt-3 space-y-3">
                    <input type="hidden" name="organizationId" value={org.id} />
                    <input type="hidden" name="academicYear" value={ay} />
                    <p className="text-xs text-content-secondary">
                      Your account details (name, student number, course) are pulled from your student profile — the officers will
                      review and approve your membership.
                    </p>
                  </ActionForm>
                </details>
              )}

              {canManageMembers && (
                <details className="mt-4 rounded-lg border border-dashed border-line-strong px-4 py-3">
                  <summary className="cursor-pointer text-xs font-semibold text-primary">
                    <UserPlus className="mr-1 inline size-3.5" aria-hidden />
                    Add members for AY {ay}
                  </summary>

                  {/* Bulk picker: search the student directory and register many at once (§13). */}
                  <MemberPicker organizationId={org.id} academicYear={ay} />

                  {canManage && (
                    <>
                      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-content-muted">
                        Single add with position
                      </p>
                      <ActionForm
                        action={addMember}
                        submitLabel="Add member"
                        footerClassName="mt-3"
                        className="mt-3 space-y-3"
                      >
                        <input type="hidden" name="organizationId" value={org.id} />
                        <input type="hidden" name="academicYear" value={ay} />
                        <Field label="Student" htmlFor="mem-user">
                          <Select id="mem-user" name="userId" required defaultValue="">
                            <option value="" disabled>
                              Select student account…
                            </option>
                            {studentPool.map((u) => (
                              <option key={u.id} value={u.id}>
                                {fullName(u)}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Position" htmlFor="mem-pos">
                          <Select id="mem-pos" name="position" required defaultValue="MEMBER">
                            <option value="MEMBER">Member</option>
                            <option value="PRESIDENT">President</option>
                            <option value="SECRETARY">Secretary</option>
                          </Select>
                        </Field>
                      </ActionForm>
                    </>
                  )}
                </details>
              )}
            </CardContent>
          </Card>

          {/* Recognition history */}
          <Card>
            <CardHeader
              icon={Award}
              title="Recognition history"
              description="All applications and renewals are preserved permanently."
            />
            {org.recognitions.length === 0 ? (
              <EmptyState
                title="No recognition records"
                description="This organization has not filed for recognition yet."
                className="border-0"
              />
            ) : (
              <ul className="divide-y divide-line">
                {org.recognitions.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <div>
                      <Link
                        href={`/recognition/${r.id}`}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        AY {r.academicYear}
                      </Link>
                      <p className="text-xs text-content-secondary">
                        {r.kind === "RENEWAL" ? "Renewal" : "Initial application"}
                        {r.events[0] ? ` · last update ${formatDate(r.events[0].createdAt)}` : ""}
                      </p>
                    </div>
                    <Badge tone={RECOGNITION_STATUS_META[r.status].tone}>
                      {RECOGNITION_STATUS_META[r.status].label}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader icon={Network} title="Hierarchy" />
            <CardContent className="space-y-3 text-sm">
              {org.parent ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">
                    Mother organization
                  </p>
                  <Link
                    href={`/organizations/${org.parent.id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {org.parent.acronym ?? org.parent.name}
                  </Link>
                </div>
              ) : (
                <p className="text-content-secondary">
                  {org.type === "MOTHER" ? "Mother organization." : "Independent organization."}
                </p>
              )}
              {org.children.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">
                    Sub-organizations ({org.children.length})
                  </p>
                  <ul className="mt-1 space-y-1">
                    {org.children.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/organizations/${c.id}`}
                          className="inline-flex items-center gap-1.5 text-content hover:text-primary hover:underline"
                        >
                          <span aria-hidden className="text-content-muted">└</span>
                          {c.acronym ?? c.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader icon={Users} title="At a glance" />
            <CardContent className="grid grid-cols-2 gap-4 text-center">
              <div className="rounded-lg bg-surface-secondary p-3">
                <p className="font-display text-2xl font-bold text-content">{currentMembers.length}</p>
                <p className="text-xs text-content-secondary">Members (AY {ay})</p>
              </div>
              <div className="rounded-lg bg-surface-secondary p-3">
                <p className="font-display text-2xl font-bold text-content">{currentAdvisers.length}</p>
                <p className="text-xs text-content-secondary">Advisers (AY {ay})</p>
              </div>
              <div className="rounded-lg bg-surface-secondary p-3">
                <p className="font-display text-2xl font-bold text-content">{org.recognitions.length}</p>
                <p className="text-xs text-content-secondary">Recognition records</p>
              </div>
              <div className="rounded-lg bg-surface-secondary p-3">
                <p className="font-display text-2xl font-bold text-content">
                  {org.status === "ACTIVE" ? "Active" : "Inactive"}
                </p>
                <p className="text-xs text-content-secondary">Operational status</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
