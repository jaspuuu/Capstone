import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const LOGIN_MARKER = "Sign in to your account";
const conn = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

type Check = { label: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const rec = (label: string, ok: boolean, detail = "") => checks.push({ label, ok, detail });

async function mintToken(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId: user!.id, expiresAt: new Date(Date.now() + 3600e3), ipAddress: null, userAgent: "form-workspace-probe" } });
  return token;
}

async function fetchText(url: string, token: string) {
  const res = await fetch(`${BASE}${url}`, { headers: { Cookie: `organize_session=${token}` }, redirect: "manual" });
  return { status: res.status, text: await res.text() };
}

async function clean(orgId: string) {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "FormDocumentVersion" WHERE "formDocumentId" IN
       (SELECT id FROM "FormDocument" WHERE "organizationId" = $1)`, orgId);
  await prisma.$executeRawUnsafe(`DELETE FROM "FormDocument" WHERE "organizationId" = $1`, orgId);
}

async function routeState(formKey: string, orgId: string) {
  const r = await prisma.signatureRoute.findUnique({
    where: { entityType_entityId: { entityType: "SF", entityId: `${formKey}:${orgId}:2026-2027` } },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!r) return { editable: true, completed: false, rejected: false, returned: false, signed: 0, current: 0 };
  const signed = r.steps.filter((s) => s.status === "SIGNED").length;
  const current = r.steps.filter((s) => s.status === "CURRENT").length;
  return { editable: r.state !== "COMPLETED" && r.state !== "REJECTED" && signed === 0 && current === 0, completed: r.state === "COMPLETED", rejected: r.state === "REJECTED", returned: r.state === "RETURNED_FOR_REVISION", signed, current };
}

async function main() {
  await prisma.session.deleteMany({ where: { userAgent: "form-workspace-probe" } });
  const org = await prisma.organization.findFirst({ where: { acronym: "CCS-SBO" } });
  const president = await prisma.organizationMember.findFirst({ where: { organizationId: org!.id, position: "PRESIDENT", isCurrent: true }, select: { user: { select: { email: true } } } });
  if (!president) throw new Error("No current CCS-SBO president");
  const token = await mintToken(president.user.email);

  for (const [formKey, path] of [
    ["SF001", "/forms/sf-001"],
    ["SF002", "/forms/sf-002"],
    ["SF003", "/forms/sf-003"],
    ["SF004", "/forms/sf-004"],
    ["SF005", "/forms/sf-005"],
    ["SF006", "/forms/sf-006"],
  ] as const) {
    const rs = await routeState(formKey, org!.id);
    const { status, text } = await fetchText(`${path}?org=${org!.id}&ay=2026-2027`, token);
    rec(`${formKey} workspace 200`, status === 200, `status=${status}`);
    rec(`${formKey} not redirected to login`, !text.includes(LOGIN_MARKER));
    rec(`${formKey} toolbar shows form code`, text.includes(`LSPU-OSAS-${formKey}`));
    rec(`${formKey} Edit Form button ${rs.editable ? "shown" : "hidden"} (${rs.editable})`,
      text.includes("Edit Form") === rs.editable,
      `editable=${rs.editable} signed=${rs.signed} current=${rs.current} completed=${rs.completed}`);
    rec(`${formKey} Review button present (escaped & ok)`,
      text.includes("Review workflow") || text.includes("Review &amp; Sign"),
      `canSignNow=` + (text.includes("Review &amp; Sign") ? "yes" : "no"));
    rec(`${formKey} status bar present`, /Draft|Submitted|For Signature|Revision|Approved/.test(text));
    rec(`${formKey} Version history toggle`, text.includes("Version history"));
    rec(`${formKey} official form section`, text.includes("Official form"));
    rec(`${formKey} signature workflow panel`, text.includes("Signature workflow"));
  }

  // Draft lifecycle (SF006 fresh): creating it leaves all steps LOCKED.
  const sf006Route = await prisma.signatureRoute.findUnique({
    where: { entityType_entityId: { entityType: "SF", entityId: `SF006:${org!.id}:2026-2027` } },
    include: { steps: true },
  });
  rec("SF006 freshly-created route has no CURRENT/signed step (locked draft)",
    !!sf006Route && sf006Route.steps.every((s) => s.status === "LOCKED"),
    sf006Route ? sf006Route.steps.map((s) => s.status).join(",") : "no route");

  // Export override + no-draft export.
  await clean(org!.id);
  await prisma.formDocument.create({
    data: {
      formKey: "SF006", organizationId: org!.id, academicYear: "2026-2027", version: 1,
      data: { orgName: "SBO-College of Computer Studies (CCS-SBO)", date: "September 10, 2026" },
      versions: { create: { version: 1, action: "DRAFT_SAVED", note: "Initial draft", data: { orgName: "SBO-College of Computer Studies (CCS-SBO)", date: "September 10, 2026" } } },
    },
  });
  const pdf = await fetchText(`/api/org/${org!.id}/documents/sf006/export?ay=2026-2027&format=pdf`, token);
  rec("export with draft override generates PDF", pdf.status === 200 && pdf.text.startsWith("%PDF"), `status=${pdf.status}`);
  const docx = await fetchText(`/api/org/${org!.id}/documents/sf006/export?ay=2026-2027`, token);
  rec("export DOCX with override 200 + PK", docx.status === 200 && docx.text.startsWith("PK"), `status=${docx.status}`);
  const noDraft = await fetchText(`/api/org/${org!.id}/documents/sf001/export?ay=2026-2027&format=pdf`, token);
  rec("export without draft override 200", noDraft.status === 200, `status=${noDraft.status}`);

  await clean(org!.id);
}

main()
  .then(() => {
    let fail = 0;
    for (const c of checks) { if (!c.ok) fail++; console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.label}${c.detail ? ` — ${c.detail}` : ""}`); }
    console.log(`\n${checks.length - fail}/${checks.length} passed`);
    process.exit(fail ? 1 : 0);
  })
  .catch((e) => { console.error(e); process.exit(1); });