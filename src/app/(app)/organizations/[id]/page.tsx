import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  CalendarDays,
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
  ORG_STATE_META,
  ORG_TYPE_LABELS,
  RECOGNITION_STATUS_META,
} from "@/lib/constants";
import { deriveOrgState } from "@/lib/org-state";
import { currentAcademicYear, formatDate, fullName } from "@/lib/utils";
import { Badge, Chip } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/form";
import { ActionForm, QuickActionForm } from "@/components/action-form";
import {
  addMember,
  assignAdviser,
  removeAdviserAssignment,
  removeMember,
  setOrganizationStatus,
} from "@/lib/actions/organizations";

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
  const isOfficer =
    user.role === "PRESIDENT" || user.role === "SECRETARY"
      ? org.members.some((m) => m.userId === user.id)
      : false;

  const currentAdvisers = org.advisers.filter((a) => a.academicYear === ay);
  const currentMembers = org.members.filter((m) => m.academicYear === ay);
  const currentRec = org.recognitions.find((r) => r.academicYear === ay);
  const hasPriorRecognition = org.recognitions.some((r) =>
    ["APPROVED", "RECOGNIZED"].includes(r.status)
  );

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
          {isOfficer && !currentRec && (
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
          {canManage && (
            <>
              <Link
                href={`/organizations/${org.id}/edit`}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-content hover:border-primary"
              >
                <Pencil className="size-4" aria-hidden />
                Edit
              </Link>
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
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
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
                const a = currentAdvisers.find((x) => x.type === t);
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
                        action={removeAdviserAssignment}
                        hidden={{ assignmentId: a.id }}
                        label="Remove"
                        variant="ghost"
                        confirmMessage={`Remove ${fullName(a.adviser)} as ${ADVISER_TYPE_LABELS[t]}?`}
                      />
                    )}
                  </div>
                );
              })}

              {canManage && (
                <details className="rounded-lg border border-dashed border-line-strong px-4 py-3">
                  <summary className="cursor-pointer text-xs font-semibold text-primary">
                    <UserPlus className="mr-1 inline size-3.5" aria-hidden />
                    Assign an adviser for AY {ay}
                  </summary>
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
                            {fullName(u)} — {u.role === "ADVISER_REGULAR" ? "Regular" : "Part-Time"}
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
              description={`${currentMembers.length} registered for the current academic year.`}
            />
            <CardContent>
              {currentMembers.length === 0 ? (
                <p className="text-sm text-content-muted">No members registered yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {currentMembers.map((m) => (
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
                        <Chip>{MEMBER_POSITION_LABELS[m.position]}</Chip>
                        {canManage && (
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

              {canManage && (
                <details className="mt-4 rounded-lg border border-dashed border-line-strong px-4 py-3">
                  <summary className="cursor-pointer text-xs font-semibold text-primary">
                    <UserPlus className="mr-1 inline size-3.5" aria-hidden />
                    Add a member for AY {ay}
                  </summary>
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
