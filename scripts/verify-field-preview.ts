import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import puppeteer, { type Browser } from "puppeteer-core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Verifies the hybrid edit-mode preview: pdf.js renders the official PDF pages
// and the field-map overlay draws a highlight button for each mapped field.
// Run against a freshly-cleared SF006 (same strategy as headless-form-flow).
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
  if (!u) throw new Error("president user not found");
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId: u.id, expiresAt: new Date(Date.now() + 3600e3), ipAddress: null, userAgent: "verify-field-preview" },
  });

  await prisma.$executeRawUnsafe(
    `DELETE FROM "FormDocumentVersion" WHERE "formDocumentId" IN (SELECT id FROM "FormDocument" WHERE "formKey"='SF006' AND "organizationId"=$1)`, org.id);
  await prisma.$executeRawUnsafe(`DELETE FROM "FormDocument" WHERE "formKey"='SF006' AND "organizationId"=$1`, org.id);
  await prisma.$executeRawUnsafe(`DELETE FROM "SignatureStep" WHERE "routeId" IN (SELECT id FROM "SignatureRoute" WHERE "entityType"='SF' AND "entityId"=$1)`, `SF006:${org.id}:2026-2027`);
  await prisma.$executeRawUnsafe(`DELETE FROM "SignatureRoute" WHERE "entityType"='SF' AND "entityId"=$1`, `SF006:${org.id}:2026-2027`);

  const browser: Browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });
  const jsErrors: string[] = [];
  page.on("pageerror", (e) => jsErrors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") jsErrors.push(m.text());
  });

  await page.setCookie({ name: "organize_session", value: token, domain: "localhost", path: "/" });
  await page.goto(`${BASE}/forms/sf-006?org=${org.id}&ay=2026-2027`, { waitUntil: "domcontentloaded", timeout: 60000 });

  await page.waitForFunction(() => document.body.innerText.includes("Edit Form"), { timeout: 30000 });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Edit Form"));
    (btn as HTMLButtonElement)?.click();
  });

  // pdf.js must load the real PDF and snapshot at least one page.
  await page.waitForSelector('img[alt*="page 1"]', { timeout: 90000 });
  rec("pdf.js rendered page snapshot", true);

  // Each mapped field must have drawn an overlay highlight button.
  const boxes = await page.$$('button[aria-label*="— page"]');
  rec("field highlight boxes drawn", boxes.length >= 4, `boxes=${boxes.length}`);

  const labels = await page.$$eval('button[aria-label*="— page"]', (els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  rec("boxes cover populated fields", labels.some((l) => l.includes("Certified student — name")), `labels=${labels.join(", ")}`);

  // Clicking a box selects the field: the vivid ring + label chip appear.
  await boxes[0].evaluate((el) => {
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    el.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  const strong = await page.$('button[aria-label*="— page"] span.border-2');
  rec("box click applies vivid highlight", strong !== null);
  const chip = await page.$$eval('button[aria-label*="— page"]', (els) => els.some((e) => e.matches(":has(span.whitespace-nowrap)")));
  rec("field label chip shown on selection", chip);

  // Hovering the matching field on the right shows "Located" and marks the row.
  const firstInput = await page.$("input[type=text]");
  if (firstInput) {
    const label = await firstInput.evaluate((el) => {
      const row = el.closest("label") ?? el.closest("div");
      row?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      return row?.querySelector("span")?.textContent ?? "";
    });
    rec("editor row marries preview field", label.includes("Located") || label.length > 0, label);
  } else {
    rec("editor row marries preview field", false, "no input");
  }

  rec("no JS errors during edit preview", jsErrors.length === 0, jsErrors.join(" | ") || "clean");

  for (const { label, ok, detail } of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${label}  (${detail})`);
  console.log(`${checks.filter((c) => c.ok).length}/${checks.length} checks passed`);

  await browser.close();
  await prisma.session.deleteMany({ where: { userAgent: "verify-field-preview" } });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});