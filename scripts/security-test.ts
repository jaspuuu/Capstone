import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, SignatoryRole } from "../src/generated/prisma/client";
import { authorizeStepForUser, canUserSign } from "../src/lib/signature-policy";

// ---------------------------------------------------------------------------
// SIGNATURE AUTHORIZATION SECURITY TESTS (§30 acceptance criteria).
// Exercises the SAME centralized policy the server actions enforce: the org is
// always derived from the routed record, so URL/document-id manipulation and
// cross-organization signing cannot widen authorization.
// ---------------------------------------------------------------------------

const AY = "2026-2027";
const BASE = "http://localhost:3000";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}${extra ? `  (${extra})` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${extra ? `  (${extra})` : ""}`);
  }
}

async function findUser(email: string) {
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u) throw new Error(`missing fixture user ${email}`);
  return u;
}

async function mint(email: string, ua: string) {
  const user = await findUser(email);
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600_000),
      ipAddress: null,
      userAgent: ua,
    },
  });
  return { token, user };
}

const entityId = (orgId: string, fk = "SF003") => `${fk}:${orgId}:${AY}`;

async function createFreshRoute(formKey: string, orgId: string, roles: string[]) {
  const ent = entityId(orgId, formKey);
  await prisma.signatureRoute.deleteMany({ where: { entityType: "SF", entityId: ent } });
  const route = await prisma.signatureRoute.create({
    data: {
      entityType: "SF",
      entityId: ent,
      formKey,
      title: "Security test route",
      state: "IN_PROGRESS",
      createdById: (await findUser("president.acs@lspu.edu.ph")).id,
      steps: {
        create: roles.map((r, i) => ({
          order: i + 1,
          role: r as SignatoryRole,
          status: i === 0 ? "CURRENT" : "LOCKED",
        })),
      },
    },
  });
  return route;
}

async function main() {
  const orgA = await prisma.organization.findFirst({ where: { acronym: "CCS-SBO" } });
  const presA = await findUser("president.acs@lspu.edu.ph");
  const memberA = await findUser("member1.acs@lspu.edu.ph");
  const adviserA = await prisma.user.findFirst({ where: { email: "adviser.regular@lspu.edu.ph" } });
  if (!orgA || !adviserA) throw new Error("missing fixture org or adviser.regular");

  // Org B must be an organization President A does NOT preside or belong to —
  // the cross-org fixtures depend on it (the seeded re-runs promoted presA to
  // several orgs' PRESIDENT seat, which used to make "APDEV" a false negative).
  const orgB = await prisma.organization.findFirst({
    where: {
      id: { not: orgA.id },
      status: "ACTIVE",
      members: {
        none: {
          userId: presA.id,
          position: "PRESIDENT",
          academicYear: AY,
          isCurrent: true,
        },
      },
    },
  });
  if (!orgB) throw new Error("no fixture org exists where President A is not the current PRESIDENT officer");

  void (await createFreshRoute("SF003", orgA.id, ["PRESIDENT", "SECRETARY", "SENIOR_ADVISER", "DEAN"]));
  void (await createFreshRoute("SF003", orgB.id, ["PRESIDENT", "SECRETARY", "SENIOR_ADVISER", "DEAN"]));
  void (await createFreshRoute("SF006", orgA.id, ["SENIOR_ADVISER", "DEAN", "OSAS"]));

  console.log("-- Test 1: current President A, Organization A document -> ALLOW");
  const t1 = await canUserSign({ userId: presA.id, entityType: "SF", entityId: entityId(orgA.id) });
  check("President A may sign Org A SF-003 (current = President)", t1);

  console.log("-- Test 2: President A, Organization B document -> DENY");
  const t2 = await canUserSign({ userId: presA.id, entityType: "SF", entityId: entityId(orgB.id) });
  check("President A cannot sign Org B SF-003", !t2);

  console.log("-- Test 3: Member A, Org A document requiring President -> DENY");
  const t3 = await canUserSign({ userId: memberA.id, entityType: "SF", entityId: entityId(orgA.id) });
  check("Member A cannot sign Org A President step", !t3);

  console.log("-- Test 4: President A, Org B by entity-id swap -> DENY (IDOR)");
  const t4 = await canUserSign({ userId: presA.id, entityType: "SF", entityId: entityId(orgB.id) });
  check("URL/entity-id manipulation cannot grant access", !t4);

  console.log("-- Test 5: Direct backend call, President A -> Org B route -> DENY");
  try {
    await authorizeStepForUser({ userId: presA.id, entityType: "SF", entityId: entityId(orgB.id) });
    check("Direct API call rejected", false);
  } catch (e) {
    const code = (e as { code?: string }).code;
    check("Direct API call rejected", code === "NOT_YOUR_STEP", `denied(code=${code})`);
  }

  console.log("-- Test 6: Former President A, Org A document -> DENY (assignment ended)");
  const mem = await prisma.organizationMember.findFirst({
    where: { organizationId: orgA.id, userId: presA.id, position: "PRESIDENT", academicYear: AY },
  });
  if (!mem) throw new Error("missing president membership");
  await prisma.organizationMember.update({ where: { id: mem.id }, data: { isCurrent: false } });
  const t6 = await canUserSign({ userId: presA.id, entityType: "SF", entityId: entityId(orgA.id) });
  await prisma.organizationMember.update({ where: { id: mem.id }, data: { isCurrent: true } });
  check("Former President A denied after assignment ended", !t6);

  console.log("-- Test 7: Current President A, document NOT at President stage -> DENY");
  const t7 = await canUserSign({ userId: presA.id, entityType: "SF", entityId: entityId(orgA.id, "SF006") });
  check("President A cannot skip ahead to adviser stage", !t7);

  console.log("-- Test 8: Already-signed (COMPLETED) document -> DENY");
  const completed = await prisma.signatureRoute.findFirst({ where: { entityType: "SF", state: "COMPLETED" } });
  if (!completed) {
    check("Completed route exists (fixture)", false);
  } else {
    const t8 = await canUserSign({ userId: presA.id, entityType: completed.entityType, entityId: completed.entityId });
    check("Completed document rejects any further signature", !t8);
  }

  console.log("-- Test 9: Multi-org student (President of A, Member of B)");
  const bMembership = await prisma.organizationMember.findFirst({
    where: { organizationId: orgB.id, userId: presA.id, academicYear: AY },
  });
  const createdMembership = !bMembership;
  if (createdMembership) {
    await prisma.organizationMember.create({
      data: {
        organizationId: orgB.id,
        userId: presA.id,
        position: "MEMBER",
        status: "ACTIVE",
        academicYear: AY,
        isCurrent: true,
      },
    });
  } else if (bMembership!.position !== "MEMBER") {
    await prisma.organizationMember.update({ where: { id: bMembership!.id }, data: { position: "MEMBER" } });
  }
  const allowA = await canUserSign({ userId: presA.id, entityType: "SF", entityId: entityId(orgA.id) });
  const denyB = await canUserSign({ userId: presA.id, entityType: "SF", entityId: entityId(orgB.id) });
  check("Org A: President signature allowed", allowA);
  check("Org B: President signature denied (only a Member there)", !denyB);
  if (createdMembership) {
    await prisma.organizationMember.delete({ where: { id: (await prisma.organizationMember.findFirst({ where: { organizationId: orgB.id, userId: presA.id, academicYear: AY } }))!.id } });
  } else if (bMembership) {
    await prisma.organizationMember.update({ where: { id: bMembership.id }, data: { position: bMembership.position } });
  }

  console.log("-- HTTP-level: page UI reflects the server decision");
  const { token: pAt } = await mint("president.acs@lspu.edu.ph", "sec-harness");
  const hdr = { headers: { Cookie: `organize_session=${pAt}` } };
  const own = await fetch(`${BASE}/forms/sf-003?org=${orgA.id}&ay=${AY}`, hdr);
  const ownHtml = await own.text();
  check("Own-org form page exposes signing control", ownHtml.includes("Attach my signature") && ownHtml.includes("You are the authorized signatory"));
  const other = await fetch(`${BASE}/forms/sf-003?org=${orgB.id}&ay=${AY}`, hdr);
  const otherHtml = await other.text();
  check(
    "Other-org form page is denied (no 200 render with content)",
    other.status === 403 || other.status === 404 || otherHtml.includes("__next_error__"),
    `status=${other.status}`
  );
  check("Other-org form page hides signing control", !otherHtml.includes("Attach my signature"));

  const { token: mAt } = await mint("member1.acs@lspu.edu.ph", "sec-harness-m");
  const memberPage = await fetch(`${BASE}/forms/sf-003?org=${orgA.id}&ay=${AY}`, { headers: { Cookie: `organize_session=${mAt}` } });
  const mHtml = await memberPage.text();
  check("Member view of own org still cannot sign", !mHtml.includes("Attach my signature"));
  check("Member view explains who is awaited + why (not authorized)", mHtml.includes("waiting for the authorized President") && mHtml.includes("not the authorized"));

  // Cleanup test routes + sessions.
  for (const ent of [entityId(orgA.id), entityId(orgB.id), entityId(orgA.id, "SF006")]) {
    await prisma.signatureRoute.deleteMany({ where: { entityType: "SF", entityId: ent } });
  }
  await prisma.session.deleteMany({ where: { userAgent: { in: ["sec-harness", "sec-harness-m"] } } });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});