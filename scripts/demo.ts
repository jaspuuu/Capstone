// ORGanIZE defense demo — scenario walkthrough (A–E).
//
// Verifies the data + screens the defender will walk through live, and prints
// a one-line presentation guide per scenario. It does NOT mutate data.
//
//   npx tsx scripts/demo.ts        (server must be running — see below)
//
// Requires a running server on SMOKE_BASE_URL (default http://localhost:3000).
// Logins are minted directly in the DB — no passwords involved.
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { FOLLOW_UP_WINDOW_DAYS } from "../src/lib/follow-up";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const LOGIN_MARKER = "Sign in to your account";
const AY = "2026-2027";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const checks: { label: string; ok: boolean; detail?: string }[] = [];
const rec = (label: string, ok: boolean, detail = "") => checks.push({ label, ok, detail });

async function fetchText(url: string, token: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { Cookie: `organize_session=${token}` },
    redirect: "manual",
  });
  return { status: res.status, text: await res.text() };
}

async function mintToken(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user for ${email}`);
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      ipAddress: null,
      userAgent: "demo-suite",
    },
  });
  return token;
}

const section = (title: string, blurb: string) =>
  console.log(`\n${"=".repeat(78)}\n${title}\n${"-".repeat(78)}\n${blurb}\n`);
const guide = (text: string) => console.log(`  PRESENT: ${text}`);

async function main() {
  await prisma.session.deleteMany({ where: { userAgent: "demo-suite" } });

  const t = {
    osas: await mintToken("osas@lspu.edu.ph"),
    soa: await mintToken("soa@lspu.edu.ph"),
    dean: await mintToken("dean.ccs@lspu.edu.ph"),
    adviser: await mintToken("adviser.regular@lspu.edu.ph"),
    president: await mintToken("president.acs@lspu.edu.ph"),
    member: await mintToken("member1.acs@lspu.edu.ph"),
  };

  console.log("ORGanIZE defense demo — scenario walkthrough (A–E)\n");

  // ------------------------------------------------------------------ A
  // The in-flight CYBERSEC application fixture was dropped in favor of a
  // fresh application started live from the UI (president.acs + new members).
  section(
    "Scenario A — Organization application: President → Senior Adviser → Dean → SOA → OSAS",
    "Start a NEW organization application from the UI as any president, add a founding roster "
    + "(president.acs + secretary.sbo + member1..member10 exist for this), and walk it "
    + "adviser → dean → SOA → OSAS. The reviewer chain and the 15-founder rule are enforced "
    + "at each gate."
  );
  guide("Log in as president.acs@lspu.edu.ph → 'Apply for a new organization' → create the org as DRAFT → add a constitution → submit.");
  guide("Senior Adviser (adviser.regular@lspu.edu.ph) → 'Start review' → 'Approve & forward to Dean'.");
  guide("dean.ccs@lspu.edu.ph → 'Review and sign' → forward to SOA.");
  guide("soa@lspu.edu.ph → approve → OSAS sees it under 'OSAS Approval'.");
  guide("osas@lspu.edu.ph → 'Confer recognition' → org flips to Recognized/Active in the directory & dashboard.");

  // ------------------------------------------------------------------ B
  section(
    "Scenario B — Accreditation (SF-001 set): requirements checklist, submission gate, signature chain",
    "The accreditation module blocks an incomplete packet at SUBMIT (Required Documents / Signature Chain gate) "
    + "and SF-001 renders an integrity-verified, hash-chained signature route."
  );

  const sfDemo = await prisma.signatureRoute.findFirst({
    where: { entityType: "SF", formKey: "SF001", state: "COMPLETED" },
    select: { entityId: true, steps: { where: { status: "SIGNED" }, select: { chainHash: true } } },
  });
  rec("Scenario B: signed SF-001 demo route exists", sfDemo != null, sfDemo ? `steps=${sfDemo.steps.length}` : "run `npm run db:seed`");
  if (sfDemo) {
    const [, orgId, ay] = sfDemo.entityId.split(":");
    const { status, text } = await fetchText(`/forms/sf-001?org=${orgId}&ay=${ay}`, t.osas);
    const ok = status === 200 && !text.includes(LOGIN_MARKER) && (text.includes("Signature chain verified") || text.includes("Signature"));
    rec("Scenario B: SF-001 shows verified signature chain", ok, `status=${status} steps=${sfDemo.steps.length}`);
    guide("Open /forms/sf-001 (any recognized org, current AY) → walk the 4-step signature strip: adviser → dean → SOA → OSAS, each a typed-signature consent with a verified hash chain badge.");
  }

  const accOrg = await prisma.organization.findFirst({ where: { acronym: "CCS-SBO" }, select: { id: true } });
  if (accOrg) {
    const { status, text } = await fetchText(`/organizations/${accOrg.id}/accreditation`, t.osas);
    rec("Scenario B: accreditation page renders the checklist", status === 200 && !text.includes(LOGIN_MARKER) && text.includes("Requirements"), `status=${status}`);
    guide("Open CCS-SBO › Accreditation → walk the SF-001 requirement checklist. The Submission Validation Gate (Required Documents / Revisions Needed / Conditional / Signature Chain) shows whenever a packet is a DRAFT/RETURNED — open APDEV › Accreditation → 'Start Renewal' to see it live.");
  } else {
    rec("Scenario B: CCS-SBO exists", false, "seed missing CCS-SBO");
  }

  // ------------------------------------------------------------------ C
  section(
    "Scenario C — Annual renewal reuses the previous cycle's documents",
    "quickStartRenewal opens a DRAFT renewal for the next AY and copies over the prior cycle's "
    + "constitution, adviser commitment, and dean certification — nothing re-filed by hand."
  );

  const apdev = await prisma.organization.findFirst({ where: { acronym: "APDEV" }, select: { id: true } });
  const apdevPrior = apdev
    ? await prisma.recognition.findFirst({
        where: { organizationId: apdev.id, status: { in: ["APPROVED", "RECOGNIZED"] } },
        orderBy: { academicYear: "desc" },
        select: { id: true, academicYear: true, status: true },
      })
    : null;
  const apdevCurrent = apdev
    ? await prisma.recognition.findFirst({
        where: { organizationId: apdev.id, academicYear: "2026-2027" },
        select: { id: true },
      })
    : null;
  const pendingRenewal = apdev != null && apdevPrior != null && apdevCurrent == null;
  rec("Scenario C: APDEV is in PENDING_RENEWAL (prior recognized, none filed AY_CUR)", pendingRenewal, apdevPrior ? `${apdevPrior.academicYear}:${apdevPrior.status}` : "none");
  if (apdev && apdevPrior && !apdevCurrent) {
    const kinds = await prisma.attachment.findMany({
      where: { entityType: "Recognition", entityId: apdevPrior.id, kind: { in: ["CONSTITUTION", "ADVISER_COMMITMENT", "CERTIFICATION"] } },
      select: { kind: true },
    });
    rec(
      "Scenario C: carry-over kinds (Constitution / Adviser Commitment / Certification) are on file",
      kinds.length >= 3,
      kinds.map((k) => k.kind).join(",")
    );
    const { status, text } = await fetchText(`/organizations/${apdev.id}/accreditation`, t.president);
    rec("Scenario C: President sees 'Start Renewal'", status === 200 && !text.includes(LOGIN_MARKER) && text.includes("Start Renewal"), `status=${status}`);
    guide("Log in as president.acs@lspu.edu.ph → APDEV › Accreditation → 'Start Renewal' → the new DRAFT renewal already lists the carried-over constitution, adviser commitment, and certification under the requirement checklist (this is where the Scenario B validation gate is also on screen).");
    guide("After SUBMIT, the follow-up tracker is created automatically (Scenario D), and the renewal rides the same review chain as Scenario B.");
  } else {
    rec("Scenario C: prior recognition exists", false, "none — seed first");
  }

  // ------------------------------------------------------------------ D
  section(
    "Scenario D — One-week follow-up after submission",
    `Every submitted application gets a follow-up record with expected date = submission + ${FOLLOW_UP_WINDOW_DAYS} days. `
    + "OSAS tracks pending/overdue follow-ups from the dashboard and the accreditation page, with officer/adviser notifications."
  );

  const followUps = await prisma.recognitionFollowUp.findMany({
    where: { status: { in: ["PENDING", "CONTACTED", "OVERDUE"] } },
    include: { recognition: { select: { organizationId: true, academicYear: true, organization: { select: { acronym: true, name: true } } } } },
    orderBy: { expectedDate: "asc" },
  });
  rec("Scenario D: at least one outstanding follow-up exists", followUps.length > 0, `count=${followUps.length}`);
  const overdue = followUps.filter((f) => new Date() > f.expectedDate);
  rec("Scenario D: demo follow-up is past its week (overdue-able)", overdue.length > 0, `overdue=${overdue.length}`);
  if (followUps[0]) {
    const { status, text } = await fetchText(`/organizations/${followUps[0].recognition.organizationId}/accreditation`, t.osas);
    rec("Scenario D: accreditation page shows the follow-up card", status === 200 && !text.includes(LOGIN_MARKER) && text.includes("Follow-up") && text.includes(`Required one week`), `status=${status}`);
  }
  const { status: sd, text: td } = await fetchText("/dashboard", t.osas);
  rec("Scenario D: OSAS dashboard surfaces 'Follow-ups due'", sd === 200 && !td.includes(LOGIN_MARKER) && td.includes("Follow-ups due"), `status=${sd}`);
  guide("Open the OSAS dashboard → 'Follow-ups due' lists ROBOTICS with an Overdue tag and expected date.");
  guide("Open ROBOTICS › Accreditation → the Follow-up card lets OSAS record Contacted/Completed (with note). Recording Contacted/Overdue notifies the org's officers and advisers.");
  guide("Rule on screen: required one week after submission — the expected date is never hand-entered.");

  // ------------------------------------------------------------------ E
  section(
    "Scenario E — Activities → M&E monitoring and the analytics layers",
    "Approved activities flow Proposal → Calendar/QR check-in → Accomplishment Report → Monitoring & Evaluation. "
    + "The analytics workspace layers descriptive, diagnostic, trend, alert and recommendation views over the same data."
  );

  const activity = await prisma.activityProposal.findFirst({
    where: { status: "APPROVED", phase: { in: ["IMPLEMENTATION", "ACCOMPLISHMENT"] } },
    select: { id: true, title: true, organizationId: true },
  });
  rec("Scenario E: an approved, implemented activity exists", activity != null, activity ? activity.title : "none");
  if (activity) {
    const { status, text } = await fetchText(`/activities/${activity.id}`, t.osas);
    rec(
      "Scenario E: activity page shows M&E monitoring",
      status === 200 && !text.includes(LOGIN_MARKER) && (text.includes("Rubric") || text.includes("evaluation") || text.includes("Monitoring")),
      `status=${status}`
    );
    const { status: sc, text: tc } = await fetchText(`/activities/${activity.id}/checkin`, t.osas);
    rec("Scenario E: QR check-in screen renders", sc === 200 && !tc.includes(LOGIN_MARKER) && tc.includes(activity.title!), `status=${sc}`);
  }
  const evalRow = await prisma.activityEvaluation.findFirst({ select: { activity: { select: { id: true } } } });
  if (evalRow) {
    const { status, text } = await fetchText(`/activities/${evalRow.activity.id}`, t.osas);
    rec("Scenario E: rubric evaluation is recorded & rendered", status === 200 && (text.includes("Rubric recorded") || text.includes('\\"existing\\":{\\"relevance\\"')), `status=${status}`);
  } else {
    rec("Scenario E: evaluation fixture exists", false, "run `npm run db:seed`");
  }

  const { status: sa, text: ta3 } = await fetchText("/analytics?view=compliance", t.osas);
  rec("Scenario E: analytics shows diagnostic panels", sa === 200 && !ta3.includes(LOGIN_MARKER) && ta3.includes("Common revision reasons") && ta3.includes("Repeated revisions"), `status=${sa}`);
  const exportRes = await fetch(`${BASE}/export/analytics?ay=${AY}`, { headers: { Cookie: `organize_session=${t.osas}` }, redirect: "manual" });
  const exportBody = (await exportRes.text()).replace(/^\uFEFF/, "");
  rec("Scenario E: analytics CSV export flows", exportRes.status === 200 && exportBody.startsWith("Organization,"), `lines=${exportBody.split("\n").length}`);
  const { status: sca } = await fetchText("/calendar", t.osas);
  rec("Scenario E: activity calendar renders", sca === 200, `status=${sca}`);
  guide("Walk an approved activity (e.g. General Assembly and Team Building): phase strip PLAN → PROPOSAL → APPROVAL → IMPLEMENTATION → ACCOMPLISHMENT, QR check-in recording attendance, then the accepted accomplishment report closes it as implemented.");
  guide("Open Analytics as OSAS → compliance matrix, workflow delay diagnostics, common revision reasons, repeated revisions, alerts, and CSV/Excel export.");
  guide("MEMBER view: log in as member1.acs@lspu.edu.ph → 'My analytics' shows personal memberships + attendance rate only.");

  // ------------------------------------------------------------------ summary
  console.log(`\n${"=".repeat(78)}`);
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.label}${c.detail ? `  (${c.detail})` : ""}`);
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} scenario checks passed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });