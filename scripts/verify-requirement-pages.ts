import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function fetchText(url: string, token: string) {
  const res = await fetch(`${BASE}${url}`, {
    headers: { Cookie: `organize_session=${token}` },
    redirect: "manual",
  });
  return { status: res.status, text: await res.text() };
}

async function mintToken(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user for ${email}`);
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      ipAddress: null,
      userAgent: "req-check",
    },
  });
  return token;
}

async function main() {
  await prisma.session.deleteMany({ where: { userAgent: "req-check" } });
  const token = await mintToken("osas@lspu.edu.ph");
  const orgId = "cmtqw5m810019g4vaiod1rtd8"; // fixture org used by smoke
  const checks: [string, boolean, string][] = [];
  const rec = (label: string, ok: boolean, detail = "") => checks.push([label, ok, detail]);

  for (const key of ["CONSTITUTION", "SUPPORTING_DOCUMENTS", "FINANCIAL_REPORT", "ACCOMPLISHMENT_REPORTS"]) {
    const r = await fetchText(`/organizations/${orgId}/accreditation/requirements/${key}?ay=2026-2027`, token);
    rec(
      `${key} page 200`,
      r.status === 200 && !r.text.includes("Sign in to your account"),
      `status=${r.status}`
    );
    rec(`${key} shows lifecycle strip`, r.text.includes("Under Review") && r.text.includes("SF-001"));
    rec(`${key} shows back link`, r.text.includes("Back to accreditation"));
  }

  const nf = await fetchText(`/organizations/${orgId}/accreditation/requirements/PLAN_OF_ACTIVITIES?ay=2026-2027`, token);
  rec(
    "non-doc requirement key is not served",
    nf.status === 200 && (nf.text.includes("not found") || nf.text.includes("Not Found")),
    `status=${nf.status}`
  );

  for (const [label, ok, detail] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}  (${detail})`);
  }
  console.log(`${checks.filter((c) => c[1]).length}/${checks.length} checks passed`);
  await prisma.session.deleteMany({ where: { userAgent: "req-check" } });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});