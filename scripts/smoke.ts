import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  hashChainStep,
  signatureContentHash,
  signatureContentPayload,
  verifySignatureChain,
} from "../src/lib/signature-integrity";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const LOGIN_MARKER = "Sign in to your account";
const ROLES = [
  { role: "OSAS", email: "osas@lspu.edu.ph" },
  { role: "ADVISER", email: "adviser.regular@lspu.edu.ph" },
  { role: "MEMBER", email: "member1.acs@lspu.edu.ph" },
] as const;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

type Check = { label: string; ok: boolean; detail?: string };
const checks: Check[] = [];
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
      userAgent: "smoke-suite",
    },
  });
  return token;
}

async function main() {
  await prisma.session.deleteMany({ where: { userAgent: "smoke-suite" } });

  const tokens: Record<string, string> = {};
  for (const r of ROLES) tokens[r.role] = await mintToken(r.email);

  const sampleOrg = await prisma.organization.findFirst();
  if (!sampleOrg) throw new Error("No organizations in DB to drill into");

  const orgRows = await prisma.organization.count();
  rec("fixture: seeded organizations exist", orgRows > 0, `orgs=${orgRows}`);

  const { status: s1, text: t1 } = await fetchText("/analytics", tokens.OSAS);
  rec("OSAS /analytics returns 200", s1 === 200, `status=${s1}`);
  rec("OSAS /analytics not redirected to login", !t1.includes(LOGIN_MARKER));
  rec("OSAS /analytics shows compliance matrix", t1.includes("Organization compliance matrix"));
  rec("OSAS /analytics shows accreditation layer", t1.includes("Accreditation compliance"));
  rec("OSAS /analytics shows monitoring layer", t1.includes("Monitoring &amp; evaluation"));
  rec("OSAS /analytics shows alerts layer", t1.includes("Alerts"));
  rec("OSAS /analytics shows export action", t1.includes("Export CSV"));
  rec("OSAS /analytics shows data integrity section", t1.includes("Data integrity"));
  rec("OSAS /analytics shows rubric M&E (seeded eval)", t1.includes("Rubric-based evaluations entered by officers"));

  const { status: s2, text: t2 } = await fetchText("/analytics?type=CHILD&rec=APPROVED&ay=2026-2027", tokens.OSAS);
  rec("OSAS filtered /analytics 200", s2 === 200, `status=${s2}`);
  rec("OSAS filtered /analytics not login", !t2.includes(LOGIN_MARKER));
  rec("OSAS filtered /analytics renders a cell row", t2.includes("CSV") || t2.includes(">CCS"));

  const { status: s3, text: t3 } = await fetchText(`/analytics/org/${sampleOrg.id}`, tokens.OSAS);
  rec("OSAS drill-down 200", s3 === 200, `status=${s3}`);
  rec("OSAS drill-down not login", !t3.includes(LOGIN_MARKER));
  rec("OSAS drill-down labels org", t3.includes(sampleOrg.acronym ?? sampleOrg.name) || t3.includes("Officer ratio"));
  rec("OSAS drill-down shows strategy", /monitoring|Monitoring/.test(t3) || t3.includes("Strategic"));

  const { status: s4, text: t4 } = await fetchText(`/analytics/org/${sampleOrg.id}?tab=documents`, tokens.OSAS);
  rec("OSAS drill-down doc tab 200", s4 === 200, `status=${s4}`);
  rec("OSAS drill-down doc tab not login", !t4.includes(LOGIN_MARKER));

  const { status: s5, text: t5 } = await fetchText("/analytics", tokens.MEMBER);
  rec("MEMBER /analytics 200", s5 === 200, `status=${s5}`);
  rec("MEMBER /analytics not login", !t5.includes(LOGIN_MARKER));
  rec("MEMBER sees personal branch", t5.includes("Personal participation"));

  const { status: s6, text: t6 } = await fetchText("/analytics", tokens.ADVISER);
  rec("ADVISER /analytics 200", s6 === 200, `status=${s6}`);
  rec("ADVISER /analytics not login", !t6.includes(LOGIN_MARKER));
  rec("ADVISER sees scoped subtitle", t6.includes("Your scope: compliance monitoring"));

  const { status: s7, text: t7, } = await (async () => {
    const res = await fetch(`${BASE}/export/analytics?ay=2026-2027`, {
      headers: { Cookie: `organize_session=${tokens.OSAS}` },
      redirect: "manual",
    });
    return { status: res.status, text: await res.text() };
  })();
  rec("OSAS export 200", s7 === 200, `status=${s7}`);
  rec("OSAS export has data rows", t7.trim().split("\n").length > 2, `lines=${t7.trim().split("\n").length}`);
  rec("OSAS export works after auth (no login body)", !t7.includes(LOGIN_MARKER));
  const exportBody = t7.replace(/^\uFEFF/, "");
  rec("OSAS export is CSV", exportBody.startsWith("Organization,"), `head=${exportBody.slice(0, 60).replace(/\n/g, "\\n")}`);

  const anon = await fetch(`${BASE}/analytics`, { redirect: "manual" });
  rec("anon /analytics redirected to login", anon.status === 307 || anon.status === 308, `status=${anon.status}`);

  // ---- Signature-chain integrity unit test (in-memory) ----------------------
  const CONTENT = signatureContentHash(
    signatureContentPayload({ entityType: "SF", entityId: "sf:org:ay", formKey: "sf", title: null, version: 1, orgId: "org", academicYear: "ay" }),
  );
  const ch = (i: number, prev: string | null) =>
    hashChainStep({
      role: `R${i}`,
      signerId: `user-${i}`,
      signedAt: new Date(2026, 0, 1 + i, 9, 0),
      method: "typed",
      contentHash: CONTENT,
      prevChainHash: prev,
    });
  const h1 = ch(1, null);
  const h2 = ch(2, h1);
  const h3 = ch(3, h2);
  type ChainLinkDraft = {
    order: number;
    role: string;
    signedAt: Date;
    status: string;
    signatureMethod: string | null;
    signerId: string | null;
    chainHash: string | null;
    prevChainHash: string | null;
    contentHash: string;
  };
  const chainLinks = (mutate: (s: ChainLinkDraft[]) => void = () => {}) => {
    const base: ChainLinkDraft[] = [
      { order: 1, role: "R1", signedAt: new Date(2026, 0, 2, 9), status: "SIGNED", signatureMethod: "typed", signerId: "user-1", chainHash: h1, prevChainHash: null, contentHash: CONTENT },
      { order: 2, role: "R2", signedAt: new Date(2026, 0, 3, 9), status: "SIGNED", signatureMethod: "typed", signerId: "user-2", chainHash: h2, prevChainHash: h1, contentHash: CONTENT },
      { order: 3, role: "R3", signedAt: new Date(2026, 0, 4, 9), status: "SIGNED", signatureMethod: "typed", signerId: "user-3", chainHash: h3, prevChainHash: h2, contentHash: CONTENT },
    ];
    mutate(base);
    return base;
  };
  const intact = verifySignatureChain(chainLinks());
  rec("chain: intact 3-link chain verifies", intact.ok, `verified=${intact.verified}/${intact.total}`);
  const tampered = verifySignatureChain(chainLinks((s) => { s[1].signatureMethod = "image"; }));
  rec("chain: tampered link is detected", !tampered.ok, `ok=${tampered.ok}`);

  // ---- Evaluation + budget surface on the activity page ----------------------
  const evaluated = await prisma.activityEvaluation.findFirst({
    select: { activity: { select: { id: true } } },
  });
  if (evaluated) {
    const { status: s8, text: t8 } = await fetchText(`/activities/${evaluated.activity.id}`, tokens.OSAS);
    rec("OSAS activity page shows M&E card", s8 === 200 && (t8.includes("Rubric recorded") || t8.includes("No evaluation recorded")), `status=${s8}`);
    rec("OSAS activity page shows evaluation form", s8 === 200 && t8.includes('\\"existing\\":{\\"relevance\\"'));
  } else {
    rec("fixture: seeded activity evaluation exists", false, "no ActivityEvaluation rows — run `npm run db:seed`");
  }

  // ---- Signed SF-001 route (seeded demo) renders a verified chain -----------
  const sfDemo = await prisma.signatureRoute.findFirst({
    where: { entityType: "SF", formKey: "SF001", state: "COMPLETED" },
    select: { entityId: true, steps: { where: { status: "SIGNED" }, select: { chainHash: true } } },
  });
  rec("fixture: SF-001 signature demo route exists", sfDemo != null, sfDemo ? `steps=${sfDemo.steps.length}` : "run `npm run db:seed`");
  if (sfDemo) {
    const [, orgId, ay] = sfDemo.entityId.split(":");
    const { status: s9, text: t9 } = await fetchText(`/forms/sf-001?org=${orgId}&ay=${ay}`, tokens.OSAS);
    const signedStepCount = sfDemo.steps.length;
    const badgeVerified = t9.includes("Signature chain verified") || t9.includes(`\\"verified\\":${signedStepCount},\\"total\\":${signedStepCount}`);
    rec("sf-001 shows verified signature chain badge", s9 === 200 && badgeVerified, `status=${s9} verified=${sfDemo.steps.length}/${sfDemo.steps.length}`);
  }

  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.label}${c.detail ? `  (${c.detail})` : ""}`);
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });