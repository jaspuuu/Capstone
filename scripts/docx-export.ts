// DOCX EXPORT VALIDATION (Section 15/16 of the brief).
//
// Downloads the six official documents from the /api/org/:id/documents/:form/export
// endpoint and asserts the generated .docx is a faithful copy of the uploaded
// master:
//   * every non-edited part (styles, footers, headers, sectPr, page size,
//     numbering, settings...) is byte-for-byte identical to the master,
//   * paragraph structure is preserved (identical open/self-closing/close counts),
//   * org name and academic year are populated,
//   * stale 2020 officeholder names are replaced by today's SOA/OSAS.
// The temp organization is deleted afterwards.
//
//   npx tsx scripts/docx-export.ts     (server must be running on :3000)
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { listParagraphs, paraOpen, paraPPr } from "../src/lib/docx/ooxml";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const AY = "2026-2027";
const TEMPLATE_DIR = process.env.OSAS_TEMPLATES_DIR ?? join(process.cwd(), "templates", "osas");

// Mirrors MASTER_FILES in src/lib/docx/forms.ts (kept here so the harness does
// not pull in the server-only module).
const MASTER_FILES: Record<string, string> = {
  SF001: "001-APPLICATION-FOR-RECOGNITION-OR-RENEWAL-OF-ACCREDITED-STUDENT-ORGANIZATION.docx",
  SF002: "002-RENEWAL-FORM.docx",
  SF003: "005-COMMITMENT-FORM.docx",
  SF004: "004-PLAN-OF-ACTIVITIES.docx",
  SF005: "007-LIST-OF-MEMBERS.docx",
  SF006: "006-CERTIFICATION.docx",
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

type Check = { label: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const rec = (label: string, ok: boolean, detail = "") => checks.push({ label, ok, detail });

const FORMS = ["SF001", "SF002", "SF003", "SF004", "SF005", "SF006"];

function counts(xml: string) {
  const opens = (xml.match(/<w:p\b[^>]*>/g) ?? []).length;
  const selfClosing = (xml.match(/<w:p\b[^>]*\/>/g) ?? []).length;
  const closes = (xml.match(/<\/w:p>/g) ?? []).length;
  return { opens, selfClosing, closes };
}

async function mintToken(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user for ${email}`);
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) },
  });
  return token;
}

async function main() {
  const college = await prisma.college.findFirst({ select: { id: true } });
  if (!college) throw new Error("No college found to attach the temp organization.");
  const osas = await prisma.user.findUnique({ where: { email: "osas@lspu.edu.ph" } });
  if (!osas) throw new Error("No OSAS account; run the seed? (accounts only, not orgs)");

  const tempOrg = await prisma.organization.create({
    data: {
      name: "__SF_DOCX_TEMP__",
      collegeId: college.id,
      type: "INDEPENDENT",
      status: "ACTIVE",
      applicationStatus: "APPROVED",
    },
    select: { id: true },
  });

  try {
    const token = await mintToken(osas.email);
    const cookie = `organize_session=${token}`;

    for (const code of FORMS) {
      const url = `${BASE}/api/org/${tempOrg.id}/documents/${code.toLowerCase()}/export?ay=${AY}`;
      const res = await fetch(url, { headers: { Cookie: cookie }, redirect: "manual" });
      rec(`${code} export 200`, res.status === 200, `status=${res.status}`);
      if (res.status !== 200) {
        const body = await res.text();
        rec(`${code} body`, false, body.slice(0, 200));
        continue;
      }
      const ct = res.headers.get("Content-Type") ?? "";
      const cd = res.headers.get("Content-Disposition") ?? "";
      rec(`${code} docx content type`, ct.includes("wordprocessingml"), ct);
      rec(
        `${code} attachment disposition`,
        cd.includes(`LSPU-OSAS-${code.slice(0, 2)}-${code.slice(2)}-`),
        cd
      );

      const zip = await JSZip.loadAsync(await res.arrayBuffer());

      // Everything except the document body + its rels + new signature images
      // must be byte-for-byte identical to the uploaded master.
      const masterZip = await JSZip.loadAsync(await readFile(join(TEMPLATE_DIR, MASTER_FILES[code])));
      const editable = new Set(["word/document.xml", "word/_rels/document.xml.rels"]);
      let identical = true;
      let diffParts: string[] = [];
      for (const name of Object.keys(masterZip.files)) {
        if (name.endsWith("/")) continue;
        if (editable.has(name)) continue;
        if (!zip.file(name)) {
          identical = false;
          diffParts.push(`${name}(missing)`);
          continue;
        }
        const a = await masterZip.file(name)!.async("nodebuffer");
        const b = await zip.file(name)!.async("nodebuffer");
        if (!a.equals(b)) {
          identical = false;
          diffParts.push(name);
        }
      }
      rec(`${code} untouched parts identical`, identical, diffParts.slice(0, 6).join(","));

      const doc = (await zip.file("word/document.xml")!.async("string")).replace(/\s+/g, " ");
      const masterDoc = (await masterZip.file("word/document.xml")!.async("string")).replace(/\s+/g, " ");
      const mc = counts(masterDoc);
      const gc = counts(doc);
      rec(
        `${code} paragraph structure preserved`,
        mc.opens === gc.opens && mc.closes === gc.closes && mc.selfClosing === gc.selfClosing,
        `master ${mc.opens}/${mc.closes}/${mc.selfClosing} vs gen ${gc.opens}/${gc.closes}/${gc.selfClosing}`
      );

      // Layout fidelity: every paragraph must keep its exact opening <w:p ...>
      // tag and its full <w:pPr> (spacing, indentation, alignment, tab stops,
      // borders). Population may only change run TEXT content (+ signature
      // images); paragraph geometry is untouchable.
      const layoutOf = (x: string) =>
        listParagraphs(x).map((p) => ({ open: paraOpen(p.full), pPr: paraPPr(p.full) }));
      const ml = layoutOf(masterDoc);
      const gl = layoutOf(doc);
      let layoutOk = ml.length === gl.length;
      let layoutDiff = `count ${ml.length} vs ${gl.length}`;
      if (layoutOk) {
        for (let i = 0; i < ml.length; i++) {
          if (ml[i].open !== gl[i].open || ml[i].pPr !== gl[i].pPr) {
            layoutOk = false;
            layoutDiff = `paragraph ${i} open/pPr differs`;
            break;
          }
        }
      }
      rec(`${code} paragraph layout preserved`, layoutOk, layoutDiff);

      const pgSz = doc.match(/<w:pgSz\b[^>]*>/)?.[0] ?? "";
      rec(`${code} page size preserved`, pgSz.includes("11906") && pgSz.includes("16838"), pgSz);

      rec(`${code} org name populated`, doc.includes("__SF_DOCX_TEMP__"));

      if (code === "SF002" || code === "SF004" || code === "SF005") {
        rec(`${code} AY written`, doc.includes("2026 - 2027") || doc.includes("2026-2027"));
      }
    }

    // Officeholder swap (approved deviation): stale 2020 names replaced when
    // active SOA/OSAS accounts exist.
    const [coordinator, osasUser] = await Promise.all([
      prisma.user.findFirst({ where: { role: "SOA", isActive: true }, orderBy: { createdAt: "asc" } }),
      prisma.user.findFirst({ where: { role: "OSAS", isActive: true }, orderBy: { createdAt: "asc" } }),
    ]);
    if (coordinator && osasUser) {
      const zip = await JSZip.loadAsync(
        await (
          await fetch(`${BASE}/api/org/${tempOrg.id}/documents/sf-001/export?ay=${AY}`, {
            headers: { Cookie: `organize_session=${token}` },
          })
        ).arrayBuffer()
      );
      const doc = (await zip.file("word/document.xml")!.async("string")).replace(/\s+/g, " ");
      rec(
        "officeholder swap",
        !doc.includes("VILLAREAL") && !doc.includes("CASTILLO"),
        `expected ${coordinator.firstName} ${coordinator.lastName} / ${osasUser.firstName} ${osasUser.lastName}`
      );
    } else {
      rec("officeholder swap (skipped)", true, "no active SOA/OSAS user");
    }
  } finally {
    await prisma.organization.deleteMany({ where: { id: tempOrg.id } }).catch(() => undefined);
  }

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    if (c.ok) console.log(`PASS  ${c.label}`);
    else console.log(`FAIL  ${c.label}  ${c.detail}`);
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} docx-export checks passed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());