import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { currentAcademicYear, formatMoney } from "@/lib/utils";
import { PrintToolbar } from "@/components/forms/editable";
import { Sf004Sheets, type Sf004Activity } from "@/components/forms/sf004-sheets";
import { getApproversSignatures, getSignaturesFor } from "@/lib/signatures";
export const instant = false;

export const metadata: Metadata = { title: "SF-004 · Plan of Activities" };

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * SF-004 PLAN OF ACTIVITIES — print-perfect replica of the official OSAS form
 * (A4, Times New Roman 14pt, 25.4mm side margins). One activity per page;
 * officers can append extra pages before printing. Auto-filled from activity
 * proposals; every blank and cell stays editable. Edits are not persisted.
 */
export default async function Sf004Page({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; ay?: string }>;
}) {
  const user = await requireUser();
  const { org: orgId, ay: ayParam } = await searchParams;
  const ay = /^\d{4}-\d{4}$/.test(ayParam ?? "") ? ayParam! : currentAcademicYear();
  if (!orgId) notFound();

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      acronym: true,
      collegeId: true,
      college: { select: { name: true, dean: { select: { id: true, firstName: true, lastName: true, positionTitle: true } } } },
      members: {
        where: { isCurrent: true, academicYear: ay },
        select: { position: true, user: { select: { id: true, firstName: true, lastName: true, middleName: true } } },
      },
      advisers: {
        where: { isCurrent: true, academicYear: ay },
        select: { adviser: { select: { id: true, firstName: true, lastName: true, middleName: true } } },
      },
    },
  });
  if (!org) notFound();

  // Scope: admins, the college dean, current advisers, current members.
  const isMember = await hasMembership(user.id, orgId);
  const isAdviser = await isAdviserOf(user, orgId);
  const isDean = user.role === "DEAN" && user.collegeId === org.collegeId;
  if (!can(user, "org.manage") && !isDean && !isAdviser && !isMember) notFound();

  const activities = await db.activityProposal.findMany({
    where: { organizationId: orgId, academicYear: ay, status: { not: "REJECTED" } },
    orderBy: { startAt: "asc" },
    select: {
      title: true,
      description: true,
      objectives: true,
      venue: true,
      startAt: true,
      endAt: true,
      estimatedBudget: true,
    },
  });

  const president = org.members.find((m) => m.position === "PRESIDENT")?.user;
  const secretary = org.members.find((m) => m.position === "SECRETARY")?.user;
  const dean = org.college.dean;
  const [ayStart, ayEnd] = ay.split("-");
  const [sigMap, approverSigs] = await Promise.all([
    getSignaturesFor([
      president?.id,
      secretary?.id,
      ...org.advisers.map((a) => a.adviser.id),
      dean?.id,
    ]),
    getApproversSignatures(),
  ]);

  const rows: Sf004Activity[] = activities.map((a) => ({
    objective: a.objectives ?? "",
    activity: a.title,
    description: a.venue ? `${a.description} — Venue: ${a.venue}` : a.description,
    date: fmtDate(a.startAt),
    budget: a.estimatedBudget != null ? formatMoney(a.estimatedBudget) : "",
  }));

  return (
    <>
      <PrintToolbar backHref={`/organizations/${org.id}`} title="SF-004 Plan of Activities" />
      <Sf004Sheets
        orgDisplay={org.acronym ? `${org.name} (${org.acronym})` : org.name}
        ayStart={ayStart.slice(2)}
        ayEnd={ayEnd.slice(2)}
        presidentName={president ? `${president.firstName} ${president.lastName}` : ""}
        secretaryName={secretary ? `${secretary.firstName} ${secretary.lastName}` : ""}
        adviserNames={org.advisers.map(
          (a) => `${a.adviser.firstName}${a.adviser.middleName ? ` ${a.adviser.middleName}` : ""} ${a.adviser.lastName}`
        )}
        deanName={dean ? `${dean.firstName} ${dean.lastName}` : ""}
        activities={rows}
        presidentSig={president ? sigMap.get(president.id) ?? null : null}
        secretarySig={secretary ? sigMap.get(secretary.id) ?? null : null}
        adviserSigs={org.advisers.map((a) => sigMap.get(a.adviser.id) ?? null)}
        deanSig={dean ? sigMap.get(dean.id) ?? null : null}
        coordinatorSig={approverSigs.coordinator}
        directorSig={approverSigs.director}
      />
    </>
  );
}

async function hasMembership(userId: string, organizationId: string): Promise<boolean> {
  const m = await db.organizationMember.findFirst({
    where: { userId, organizationId, isCurrent: true },
    select: { id: true },
  });
  return Boolean(m);
}

async function isAdviserOf(
  user: { id: string; role: string },
  organizationId: string
): Promise<boolean> {
  if (user.role !== "ADVISER_REGULAR" && user.role !== "ADVISER_PARTTIME") return false;
  const a = await db.adviserAssignment.findFirst({
    where: { adviserId: user.id, organizationId, isCurrent: true },
    select: { id: true },
  });
  return Boolean(a);
}
