/**
 * Verification for Fix #1 (student-officer organization exclusivity) and
 * Fix #2 (role- and organization-scoped notifications).
 *
 * Server-side checks against the real DB. Scenarios 1-5 drive the same policy
 * primitives the server actions use (membership-exclusivity helpers); 6-9
 * validate send/read-time notification scoping end to end; 10 checks that a
 * role-holder without a current org assignment is refused at sign time.
 *
 * All data is created with a timestamped suffix and removed on exit.
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { currentAcademicYear } from "../src/lib/utils";
import {
  activeMembershipsElsewhere,
  officerAssignmentElsewhere,
  exclusivityMessage,
  isExclusiveOfficerPosition,
  EXCLUSIVE_OFFICER_POSITIONS,
} from "../src/lib/membership-exclusivity";
import { loadRelationInventory, isCurrentTaskFor } from "../src/lib/notification-scoping";
import { getNotificationFeed } from "../src/lib/notification-center";
import { notifyActiveMembers, notifyRouteSigners } from "../src/lib/notifications";
import { authorizeStepForUser, SignatureDeniedError } from "../src/lib/signature-policy";
import type { MemberPosition } from "../src/generated/prisma/client";

const seen: string[] = [];
function check(name: string, ok: boolean, extra?: string) {
  seen.push(ok ? "PASS" : "FAIL");
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
}

const AY = currentAcademicYear();
const TAG = `fix${Date.now().toString(36)}`;

const membershipIds: string[] = [];
const notificationIds: string[] = [];
const stepIds: string[] = [];
const routeIds: string[] = [];
const orgIds: string[] = [];
const userIds: string[] = [];

async function main() {
  const ccs = await db.organization.findFirst({ where: { acronym: "CCS-SBO" }, select: { collegeId: true } });
  if (!ccs) throw new Error("CCS-SBO not found — run npm run db:seed");
  const collegeId = ccs.collegeId;

  // ---- Scaffold isolated data (collision-free) ------------------------------
  const mkUser = (role: "MEMBER" | "PRESIDENT" | "OSAS", tag: string) =>
    db.user.create({
      data: { email: `${tag}.${TAG}@verify.local`, passwordHash: "x", firstName: tag, lastName: "Verify", role, isActive: true, accountStatus: "ACTIVE" },
    });
  const mkOrg = (name: string) =>
    db.organization.create({
      data: { name: `${name} ${TAG}`, type: "INDEPENDENT", collegeId, status: "ACTIVE", applicationStatus: "RECOGNIZED" },
    });

  // stud_a: role PRESIDENT but officer seat only in orgA (Fix #2's old bug trap).
  // stud_b: clean regular member subject. stud_c: orgB's actual PRESIDENT.
  const [studA, studB, studC] = await Promise.all([
    mkUser("PRESIDENT", "studA"),
    mkUser("MEMBER", "studB"),
    mkUser("MEMBER", "studC"),
  ]);
  userIds.push(studA.id, studB.id, studC.id);
  const [orgA, orgB, orgC] = await Promise.all([mkOrg("ExclOrgA"), mkOrg("ExclOrgB"), mkOrg("ExclOrgC")]);
  orgIds.push(orgA.id, orgB.id, orgC.id);
  const osas = await db.user.findFirstOrThrow({ where: { email: "osas@lspu.edu.ph" }, select: { id: true } });

  const addMembership = (data: {
    organizationId: string;
    userId: string;
    position: MemberPosition;
    status?: "ACTIVE" | "APPROVED";
    academicYear?: string;
  }) =>
    db.organizationMember
      .create({
        data: {
          organizationId: data.organizationId,
          userId: data.userId,
          position: data.position,
          status: data.status ?? "ACTIVE",
          academicYear: data.academicYear ?? AY,
          isCurrent: true,
        },
      })
      .then((m) => {
        membershipIds.push(m.id);
        return m;
      });

  const addNotification = (userId: string, organizationId: string, title: string) =>
    db.notification
      .create({
        data: {
          userId,
          type: "VERIFY_SCOPED",
          category: "SIGNATURE",
          priority: "ACTION_REQUIRED",
          title,
          body: "scoping check",
          organizationId,
          academicYear: AY,
          archivedAt: null,
        },
      })
      .then((n) => {
        notificationIds.push(n.id);
        return n.id;
      });

  // ---- Fix #1: OFFICER EXCLUSIVITY ------------------------------------------

  // TEST 1 — adding an officer where the student is an ACTIVE member of
  // another org for the same AY must be blocked.
  await addMembership({ organizationId: orgA.id, userId: studB.id, position: "MEMBER" });
  let seat = await activeMembershipsElsewhere(studB.id, orgB.id, AY);
  check(
    "TEST 1 block: officer seat add refused while active member elsewhere",
    seat !== null && seat.organizationId === orgA.id,
    seat ? `seat@${seat.organizationName}` : "none"
  );
  check(
    "TEST 1b: conflict message names the other org",
    seat !== null && exclusivityMessage("Test B", seat, "PRESIDENT").includes(seat.organizationName),
    seat ? exclusivityMessage("Test B", seat, "PRESIDENT").slice(0, 60) : "none"
  );
  const past = await activeMembershipsElsewhere(studB.id, orgB.id, "2000-2001");
  check("TEST 1c: past AY never blocks", past === null);
  const sameOrg = await activeMembershipsElsewhere(studB.id, orgA.id, AY);
  check("TEST 1d: own org never blocks", sameOrg === null);

  // TEST 2 — adding a regular member where the student is an OFFICER
  // elsewhere for the same AY must be blocked.
  await db.organizationMember.update({ where: { id: membershipIds[0] }, data: { position: "VICE_PRESIDENT" } });
  let oseat = await officerAssignmentElsewhere(studB.id, orgB.id, AY);
  check(
    "TEST 2 block: regular seat add refused while officer elsewhere",
    oseat !== null && oseat.organizationId === orgA.id,
    oseat ? `officer@${oseat.organizationName}` : "none"
  );

  // TEST 3 — promoting a member to an officer seat (setMemberPosition guard)
  // is blocked when the student holds an effective seat elsewhere.
  await db.organizationMember.update({ where: { id: membershipIds[0] }, data: { position: "MEMBER" } });
  const promoteOtherOrg = await activeMembershipsElsewhere(studB.id, orgB.id, AY);
  check("TEST 3a promote->officer blocked while seated elsewhere", promoteOtherOrg !== null);

  // TEST 4 — applyForMembership guard: a student officer elsewhere is refused.
  await db.organizationMember.update({ where: { id: membershipIds[0] }, data: { position: "TREASURER" } });
  const applyGuard = await officerAssignmentElsewhere(studB.id, orgB.id, AY);
  check("TEST 4 apply-for-membership blocked while officer elsewhere", applyGuard !== null);

  // TEST 5 — position changes WITHIN the same org are always allowed for a
  // student who holds a seat only in that org (the guard excludes target org).
  await addMembership({ organizationId: orgB.id, userId: studB.id, position: "MEMBER" });
  await addMembership({ organizationId: orgB.id, userId: studC.id, position: "PRESIDENT" });
  await db.organizationMember.update({ where: { id: membershipIds[1] }, data: { position: "SECRETARY" } });
  const sameOrgPromo = await activeMembershipsElsewhere(studC.id, orgB.id, AY);
  check("TEST 5 same-org position change allowed with no seat elsewhere", sameOrgPromo === null);
  const stillBlocked = await activeMembershipsElsewhere(studB.id, orgB.id, AY);
  check("TEST 5c cross-org change still blocked by other seat", stillBlocked !== null);
  check(
    "TEST 5b: OTHER counts as an officer seat for exclusivity",
    isExclusiveOfficerPosition("OTHER") && EXCLUSIVE_OFFICER_POSITIONS.has("OTHER")
  );

  // ---- Fix #2: NOTIFICATION SCOPING ------------------------------------------

  // TEST 6 — read layer: an ACTION_REQUIRED notification pinned to an org the
  // user holds no relationship for (orgC) is hidden from the scoped feed; a
  // pin on an org the user currently belongs to (orgB) surfaces.
  const pinHidden = await addNotification(studB.id, orgC.id, "Scoped pin hidden");
  const feedBefore = await getNotificationFeed(studB.id, { scoped: true });
  check(
    "TEST 6a ACTION_REQUIRED hidden without org relationship",
    !feedBefore.some((n) => n.id === pinHidden),
    `feed=${feedBefore.length}`
  );
  const inventoryBefore = await loadRelationInventory(studB.id);
  check(
    "TEST 6b isCurrentTaskFor rejects mismatched org/AY",
    !isCurrentTaskFor({ organizationId: orgC.id, academicYear: AY }, inventoryBefore)
  );
  const pinSurface = await addNotification(studB.id, orgB.id, "Scoped pin surface");
  const feedAfter = await getNotificationFeed(studB.id, { scoped: true });
  check(
    "TEST 6c ACTION_REQUIRED surfaces for current org",
    feedAfter.some((n) => n.id === pinSurface),
    `feed=${feedAfter.length}`
  );

  // TEST 7 — campus admins bypass relationship scoping.
  await addNotification(osas.id, orgB.id, "Admin scoped pin");
  const adminFeed = await getNotificationFeed(osas.id, { scoped: true });
  check("TEST 7 admin sees org-scoped ACTION_REQUIRED", adminFeed.some((n) => n.title === "Admin scoped pin"));

  // TEST 8 — notifyActiveMembers delivers member-only notifications to plain
  // members of the org/AY, never to officers or non-members.
  await db.organizationMember.update({ where: { id: membershipIds[1] }, data: { position: "MEMBER" } });
  await notifyActiveMembers(
    orgB.id,
    {
      type: "VERIFY_MEMBER_BROADCAST",
      category: "ACTIVITY",
      priority: "SUCCESS",
      title: "New approved activity for members",
      body: "verify broadcast",
      entityType: "ActivityProposal",
      entityId: `${orgB.id}:mem`,
      reason: "membership-based VERIFY",
    },
    { academicYear: AY }
  );
const broadcast = await db.notification.findMany({
      where: { type: "VERIFY_MEMBER_BROADCAST", organizationId: orgB.id },
      select: { id: true, userId: true, organizationId: true, academicYear: true },
    });
  broadcast.forEach((b) => notificationIds.push(b.id));
  check(
    "TEST 8a member broadcast reaches plain member only",
    broadcast.some((b) => b.userId === studB.id) &&
      !broadcast.some((b) => b.userId === studC.id) &&
      !broadcast.some((b) => b.userId === studA.id),
    `recipients=${broadcast.length}`
  );
  check(
    "TEST 8b broadcast rows carry org + academicYear",
    broadcast.every((b) => b.organizationId === orgB.id && b.academicYear === AY)
  );

  // TEST 9 — notifyRouteSigners resolves the CURRENT step's signer from org
  // relationships (org + AY + effective status), not the role column.
  const route = await db.signatureRoute.create({
    data: {
      entityType: "SF",
      entityId: `SF999X:${orgB.id}:${AY}`,
      formKey: "SF999X",
      title: `VERIFY ${TAG}`,
      state: "IN_PROGRESS",
      version: 1,
      createdById: studA.id,
    },
  });
  routeIds.push(route.id);
  const step = await db.signatureStep.create({
    data: { routeId: route.id, order: 1, role: "PRESIDENT", status: "CURRENT", signerId: studC.id },
  });
  stepIds.push(step.id);
  await notifyRouteSigners(route.id, {
    type: "VERIFY_ROUTE_SIGNER",
    category: "SIGNATURE",
    priority: "ACTION_REQUIRED",
    title: `Sign needed: ${TAG}`,
    body: "resolution check",
    dedupKey: `verify:routesigner:${TAG}`,
  });
  const signerRows = await db.notification.findMany({
    where: { type: "VERIFY_ROUTE_SIGNER", entityId: `SF999X:${orgB.id}:${AY}` },
    select: { id: true, userId: true, organizationId: true, academicYear: true },
  });
  signerRows.forEach((s) => notificationIds.push(s.id));
  check(
    "TEST 9 signer resolved to orgB PRESIDENT stud_c, not role-holder stud_a",
    signerRows.length === 1 && signerRows[0].userId === studC.id,
    `recipients=${signerRows.map((s) => s.userId.slice(0, 6)).join(",")}`
  );
  check(
    "TEST 9b signer notification carries org + AY",
    signerRows.length === 1 && signerRows[0].organizationId === orgB.id && signerRows[0].academicYear === AY
  );

  // TEST 10 — signature authorization refuses a role-holder without a current
  // org assignment, and allows the resolved signer.
  let deniedCode = "";
  try {
    await authorizeStepForUser({ userId: studA.id, entityType: "SF", entityId: `SF999X:${orgB.id}:${AY}` });
  } catch (e) {
    deniedCode = e instanceof SignatureDeniedError ? e.code : "OTHER";
  }
  check("TEST 10a role-holder without org assignment refused", deniedCode === "NOT_YOUR_STEP", deniedCode || "not denied");
  const allowed = await authorizeStepForUser({ userId: studC.id, entityType: "SF", entityId: `SF999X:${orgB.id}:${AY}` });
  check("TEST 10b resolved signer authorized", allowed.step?.role === "PRESIDENT");

  const pass = seen.filter((s) => s === "PASS").length;
  console.log(`\n${pass}/${seen.length} checks passed`);
  process.exit(pass === seen.length ? 0 : 1);
}

async function teardown() {
  try {
    if (notificationIds.length) await db.notification.deleteMany({ where: { id: { in: notificationIds } } });
    if (membershipIds.length) await db.organizationMember.deleteMany({ where: { id: { in: membershipIds } } });
    if (stepIds.length) await db.signatureStep.deleteMany({ where: { id: { in: stepIds } } });
    if (routeIds.length) await db.signatureRoute.deleteMany({ where: { id: { in: routeIds } } });
    if (orgIds.length) await db.organization.deleteMany({ where: { id: { in: orgIds } } });
    if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
  } catch (e) {
    console.error("teardown error:", e instanceof Error ? e.message : e);
  }
}

main()
  .catch(async (e) => {
    console.error("FAIL  script error:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await teardown();
    if (!process.exitCode) process.exit(0);
  });