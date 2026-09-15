import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import puppeteer, { type Browser } from "puppeteer-core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const conn = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

type Check = { label: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const rec = (label: string, ok: boolean, detail = "") => checks.push({ label, ok, detail });

async function main() {
  const org = await prisma.organization.findFirst({ where: { acronym: "CCS-SBO" } });
  if (!org) throw new Error("CCS-SBO not found");
  const pres = await prisma.organizationMember.findFirst({
    where: { organizationId: org.id, position: "PRESIDENT", isCurrent: true },
    select: { user: { select: { email: true } } },
  });
  const u = await prisma.user.findUnique({ where: { email: pres!.user.email } });
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId: u!.id, expiresAt: new Date(Date.now() + 3600e3), ipAddress: null, userAgent: "headless-form-flow" },
  });

  // Clean any previous SF006 route/draft for this org+ay to start fresh.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "FormDocumentVersion" WHERE "formDocumentId" IN (SELECT id FROM "FormDocument" WHERE "formKey"='SF006' AND "organizationId"=$1)`, org.id);
  await prisma.$executeRawUnsafe(`DELETE FROM "FormDocument" WHERE "formKey"='SF006' AND "organizationId"=$1`, org.id);
  await prisma.$executeRawUnsafe(`DELETE FROM "SignatureStep" WHERE "routeId" IN (SELECT id FROM "SignatureRoute" WHERE "entityType"='SF' AND "entityId"=$1)`, `SF006:${org.id}:2026-2027`);
  await prisma.$executeRawUnsafe(`DELETE FROM "SignatureRoute" WHERE "entityType"='SF' AND "entityId"=$1`, `SF006:${org.id}:2026-2027`);

  const browser: Browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  const jsErrors: string[] = [];
  page.on("pageerror", (e) => jsErrors.push(String(e)));

  await page.setCookie({ name: "organize_session", value: token, domain: "localhost", path: "/" });
  await page.goto(`${BASE}/forms/sf-006?org=${org.id}&ay=2026-2027`, { waitUntil: "networkidle0", timeout: 60000 });

  rec("workspace loads without JS errors", jsErrors.length === 0, jsErrors.join(" | ") || "clean");

  const bodyText = () => page.evaluate(() => document.body.innerText);
  const t0 = await bodyText();
  rec("draft lifecycle shows 'Draft'", /\bDraft\b/.test(t0), "");
  rec("Edit Form visible on fresh draft", t0.includes("Edit Form"));
  rec("Submit visible on fresh draft", t0.includes("Submit"));

  // ---- Enter Edit mode ----
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const edit = btns.find((b) => b.textContent?.includes("Edit Form"));
    (edit as HTMLButtonElement).click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("Editable fields"), { timeout: 10000 });
  rec("Edit mode shows editable-fields inspector", (await bodyText()).includes("Editable fields"));

  // ---- Change org name and save draft ----
  await page.evaluate(() => {
    const labels = [...document.querySelectorAll("label")];
    const l = labels.find((x) => x.textContent?.includes("Organization name"));
    const input = l?.querySelector("input") as HTMLInputElement | undefined;
    input!.value = "CCS Computer Studies SBO (DRAFT EDIT)";
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const save = btns.find((b) => b.textContent?.includes("Save Draft"));
    (save as HTMLButtonElement).click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("Draft saved"), { timeout: 15000 });
  rec("Save Draft persists overrides", (await bodyText()).includes("Draft saved"));
  const savedDoc = await prisma.formDocument.findUnique({
    where: { formKey_organizationId_academicYear: { formKey: "SF006", organizationId: org!.id, academicYear: "2026-2027" } },
    select: { data: true },
  });
  const orgNameSaved = (savedDoc?.data as Record<string, unknown> | undefined)?.orgName;
  rec("Save Draft values round-trip to DB", orgNameSaved === "CCS Computer Studies SBO (DRAFT EDIT)", String(orgNameSaved));

  // ---- Exit edit mode (Submit is disabled while editing), then Submit ----
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const cancel = btns.find((b) => b.textContent?.includes("Cancel Edit"));
    (cancel as HTMLButtonElement).click();
  });
  await page.waitForFunction(() => !document.body.innerText.includes("Editable fields"), { timeout: 10000 });
  const afterCancel = await bodyText();
  rec("cancel edit returns to preview", !afterCancel.includes("Editable fields") && afterCancel.includes("Edit Form"));

  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const submit = btns.find((b) => b.textContent?.trim() === "Submit");
    (submit as HTMLButtonElement).click();
  });
  await new Promise((r) => setTimeout(r, 4000));
  const afterSubmit = await bodyText();
  console.log("--- after submit attempt ---");
  console.log(afterSubmit.slice(0, 600).replace(/\n+/g, " | "));
  await page.waitForFunction((msg) => document.body.innerText.includes(msg), { timeout: 15000 }, "Document submitted");
  const tAfter = await bodyText();
  rec("Submit locks document (success msg)", tAfter.includes("Document submitted") || tAfter.includes("submitted for signatures"));
  rec("lifecycle advances to Submitted", /\bSubmitted\b/.test(tAfter));

  // After router.refresh the page props re-render: edit should be gated off.
  await page.waitForFunction(() => !document.body.innerText.includes("Edit Form"), { timeout: 15000 }).catch(() => {});
  rec("Edit Form hidden after submit", !(await bodyText()).includes("Edit Form"));
  rec("no JS errors during flow", jsErrors.length === 0, jsErrors.join(" | ") || "clean");

  await browser.close();

  // Cleanup test artifacts (route + draft) so the seeded org stays pristine.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "FormDocumentVersion" WHERE "formDocumentId" IN (SELECT id FROM "FormDocument" WHERE "formKey"='SF006' AND "organizationId"=$1)`, org.id);
  await prisma.$executeRawUnsafe(`DELETE FROM "FormDocument" WHERE "formKey"='SF006' AND "organizationId"=$1`, org.id);
  await prisma.$executeRawUnsafe(`DELETE FROM "SignatureStep" WHERE "routeId" IN (SELECT id FROM "SignatureRoute" WHERE "entityType"='SF' AND "entityId"=$1)`, `SF006:${org.id}:2026-2027`);
  await prisma.$executeRawUnsafe(`DELETE FROM "SignatureRoute" WHERE "entityType"='SF' AND "entityId"=$1`, `SF006:${org.id}:2026-2027`);
  await prisma.session.deleteMany({ where: { userAgent: "headless-form-flow" } });
}

main().then(() => {
  let fail = 0;
  for (const c of checks) { if (!c.ok) fail++; console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.label}${c.detail ? ` — ${c.detail}` : ""}`); }
  console.log(`\n${checks.length - fail}/${checks.length} passed`);
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });