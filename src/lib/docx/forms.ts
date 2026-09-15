import "server-only";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  addImagePart,
  esc,
  fillPairParagraph,
  fillParagraph,
  listParagraphs,
  loadDocxZip,
  makeImageRun,
  paraOpen,
  paraText,
  placeSignatureAtBlank,
  rebuildDocument,
  saveDocxZip,
  signatureExtent,
  signatureParagraph,
  type Paragraph,
} from "@/lib/docx/ooxml";

// ---------------------------------------------------------------------------
// Official document generation — POPULATES the uploaded master DOCX templates
// in place (existing fields only) and overlays authorized signatures. It never
// recreates, redesigns, or restructures the institutional form.
// ---------------------------------------------------------------------------

export type SignatureBytes = { bytes: Buffer };
export type SignatureRef = { rId: string; w: number; h: number; seq: number };
type Sig = SignatureRef | null;

export type FormData = {
  orgName: string;
  date: string;
  ay: string;
  semester?: string;
  president?: { name: string; sig: SignatureBytes | null };
  secretary?: { name: string; sig: SignatureBytes | null };
  advisers?: Array<{ name: string; sig: SignatureBytes | null }>;
  dean?: { name: string; sig: SignatureBytes | null };
  adviserInfo?: { name: string; college: string };
  certifiedStudent?: { name: string; courseYearSection: string; position: string };
  activities?: Array<{
    objective: string;
    activities: string;
    description: string;
    persons: string;
    targetDate: string;
    budget: string;
  }>;
  members?: Array<{ name: string; studentNo?: string; courseYearSection?: string; sig?: SignatureBytes | null }>;
};

export const MASTER_FILES: Record<string, string> = {
  SF001: "001-APPLICATION-FOR-RECOGNITION-OR-RENEWAL-OF-ACCREDITED-STUDENT-ORGANIZATION.docx",
  SF002: "002-RENEWAL-FORM.docx",
  SF003: "005-COMMITMENT-FORM.docx",
  SF004: "004-PLAN-OF-ACTIVITIES.docx",
  SF005: "007-LIST-OF-MEMBERS.docx",
  SF006: "006-CERTIFICATION.docx",
};

const OFFICER_SOA_LEGACY = "AL JOHN A. VILLAREAL";
const OFFICER_OSAS_LEGACY = "ALBERTO B. CASTILLO, EdD";
const blanksRe = /^_{6,}$/;

const pp = (s: string) => s.replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Stage diagnostics. Every failure inside the pipeline is tagged with the
// failing stage so the route can surface WHERE generation failed instead of a
// generic message (see the digitization brief §16).
// ---------------------------------------------------------------------------

export class DocxGenerationError extends Error {
  stage: string;
  constructor(stage: string, message: string) {
    super(message);
    this.name = "DocxGenerationError";
    this.stage = stage;
  }
}

async function stage<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DocxGenerationError) throw err;
    throw new DocxGenerationError(
      name,
      err instanceof Error ? err.message : String(err)
    );
  }
}

export type MasterTemplateInfo = {
  path: string;
  exists: boolean;
  size: number;
  isDocx: boolean;
};

export function masterTemplatePath(formKey: string): string {
  const masterFile = MASTER_FILES[formKey];
  if (!masterFile) throw new DocxGenerationError("template_lookup", `No master template registered for ${formKey}`);
  const dir = process.env.OSAS_TEMPLATES_DIR ?? join(process.cwd(), "templates", "osas");
  return join(dir, masterFile);
}

/**
 * Verifies the registered master for a form exists, is readable, is non-empty,
 * and actually looks like a DOCX (ZIP "PK" signature). The master is read-only
 * here — generation works on an in-memory copy and never writes to this file.
 */
export async function verifyMasterTemplate(formKey: string): Promise<MasterTemplateInfo> {
  const path = masterTemplatePath(formKey);
  try {
    const st = await stat(path);
    if (st.size === 0) {
      throw new DocxGenerationError("template_read", `Master template is empty: ${path}`);
    }
    const head = (await readFile(path)).subarray(0, 2).toString();
    if (head !== "PK") {
      throw new DocxGenerationError("template_read", `Master template is not a valid DOCX (bad ZIP signature): ${path}`);
    }
    return { path, exists: true, size: st.size, isDocx: true };
  } catch (err) {
    if (err instanceof DocxGenerationError) throw err;
    throw new DocxGenerationError(
      "template_read",
      `Master template could not be read: ${path} (${err instanceof Error ? err.message : String(err)})`
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pPrOf(xml: string): string {
  return xml.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>|<w:pPr\b[^>]*\/>/)?.[0] ?? "";
}

/** Replaces blanks inside a paragraph's <w:t> nodes top-to-bottom with the
 * given values. Underscore runs may be embedded among label text (e.g.
 * "Name: ______"); everything else is preserved verbatim. */
function fillBlanks(parXml: string, ...values: string[]): string {
  const pPr = pPrOf(parXml);
  const openEnd = parXml.indexOf(">") + 1;
  const start = pPr ? parXml.indexOf(pPr) + pPr.length : openEnd;
  const closeAt = parXml.indexOf("</w:p>", start);
  const body = closeAt >= 0 ? parXml.slice(start, closeAt) : parXml.slice(start);
  const left = [...values];
  const replaced = body.replace(/<w:t\b[^>]*>[^<]*<\/w:t>/g, (t) => {
    if (left.length === 0) return t;
    const inner = t.replace(/^<w:t[^>]*>/, "").replace(/<\/w:t>$/, "");
    if (!inner.includes("_") || !/_{6,}/.test(inner)) return t;
    const next = left.shift()!;
    const fixed = inner.replace(/_{6,}/, next);
    return `<w:t xml:space="preserve">${esc(fixed)}</w:t>`;
  });
  return paraOpen(parXml) + pPr + replaced + "</w:p>";
}

/** Single-line signature block: image then printed name via line break (same
 * official blank paragraph; nothing else changes). */
function signParagraph(
  p: Paragraph,
  who: { name: string; sig: Sig } | undefined,
  seq: { n: number }
): string | null {
  if (!who || !who.name) return null;
  const sig = who.sig ? { ...who.sig, seq: seq.n++ } : null;
  return signatureParagraph(p, sig, who.name);
}

type RefData = {
  president?: { name: string; sig: Sig };
  secretary?: { name: string; sig: Sig };
  advisers?: Array<{ name: string; sig: Sig }>;
  dean?: { name: string; sig: Sig };
  members?: Array<{ name: string; studentNo: string; courseYearSection: string; sig: Sig }>;
};

function isBlankPara(p: Paragraph): boolean {
  return blanksRe.test(pp(p.text));
}

function nextCaption(all: Paragraph[], i: number): string {
  return all[i + 1] ? pp(all[i + 1].text) : "";
}

/** Region matcher used by SF-005: the empty member slots between the legend
 * line ("Course / Year Section") and the adviser sign-off block. */
function memberSlotIndex(all: Paragraph[], i: number): number | null {
  let legend = -1;
  let end = -1;
  for (let k = 0; k < all.length; k += 1) {
    if (pp(all[k].text) === "Course / Year Section") legend = k;
    if (
      /_{20,}/.test(pp(all[k].text)) &&
      nextCaption(all, k).includes("Organization Adviser")
    ) {
      end = k;
      break;
    }
  }
  if (legend < 0 || end < 0 || i <= legend || i >= end) return null;
  if (pp(all[i].text) !== "") return null;
  let slot = 0;
  for (let k = legend + 1; k < i; k += 1) {
    if (pp(all[k].text) === "" && k >= legend + 1 && k < end) slot += 1;
  }
  return slot;
}

// ---------------------------------------------------------------------------
// Public generator
// ---------------------------------------------------------------------------

export async function generateOfficialDocx(args: {
  formKey: string;
  data: FormData;
  coordinatorName?: string;
  osasName?: string;
}): Promise<Buffer> {
  const { formKey, data, coordinatorName, osasName } = args;
  await verifyMasterTemplate(formKey);
  const zip = await stage("docx_load", async () =>
    loadDocxZip(await readFile(masterTemplatePath(formKey)))
  );
  let relsXml = await stage("docx_load", async () =>
    ((await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "")
  );
  let contentTypesXml = await stage("docx_load", async () =>
    ((await zip.file("[Content_Types].xml")?.async("string")) ?? "")
  );
  const documentXml = await stage("docx_load", async () =>
    (await zip.file("word/document.xml")!.async("string"))
  );

  const cache = new Map<string, Sig>();
  let seq = 0;
  const embed = async (sig: SignatureBytes | null): Promise<Sig> => {
    if (!sig) return null;
    const key = sig.bytes.toString("base64");
    const hit = cache.get(key);
    if (hit) return hit;
    const add = await stage("signature_insert", () =>
      addImagePart(zip, sig.bytes, relsXml, contentTypesXml)
    );
    relsXml = add.relsXml;
    if (add.contentTypesXml != null) contentTypesXml = add.contentTypesXml;
    const ext = signatureExtent(sig.bytes);
    const ref: SignatureRef = { rId: add.rId, w: ext.wEmu, h: ext.hEmu, seq };
    seq += 1;
    cache.set(key, ref);
    return ref;
  };

  const s = async (sig: SignatureBytes | null | undefined) => embed(sig ?? null);

  const dRefs: RefData = {
    president: dRef({ name: data.president?.name, sig: await s(data.president?.sig) }),
    secretary: dRef({ name: data.secretary?.name, sig: await s(data.secretary?.sig) }),
    advisers: data.advisers
      ? (await Promise.all(data.advisers.map(async (a) => dRef({ name: a.name, sig: await s(a.sig) })))).filter(
          (r): r is { name: string; sig: Sig } => r !== undefined
        )
      : undefined,
    dean: dRef({ name: data.dean?.name, sig: await s(data.dean?.sig) }),
    members: data.members
      ? await Promise.all(
          data.members.map(async (m) => ({
            name: m.name,
            studentNo: m.studentNo ?? "",
            courseYearSection: m.courseYearSection ?? "",
            sig: await s(m.sig),
          }))
        )
      : undefined,
  };

  function dRef(v: { name?: string; sig?: Sig }): { name: string; sig: Sig } | undefined {
    if (!v.name) return undefined;
    return { name: v.name, sig: v.sig ?? null };
  }

  const seqCounter = { n: 0 };

  // officeholder printed names (approved: current officeholders, not the stale
  // 2020 names baked into the master) — plain text swap keeps run formatting.
  let doc = documentXml;
  if (coordinatorName) doc = doc.split(OFFICER_SOA_LEGACY).join(coordinatorName);
  if (osasName) doc = doc.split(OFFICER_OSAS_LEGACY).join(osasName);

  const paras = await stage("rules_apply", () => listParagraphs(doc));
  const edited = await stage("rules_apply", async () => {
    const out = paras.map((p, i, all) => {
      const replaced = applyRules(args.formKey, p, i, all, data, dRefs, seqCounter);
      return { ...p, edited: replaced ?? p.full };
    });
    return out;
  });
  doc = await stage("document_write", () => rebuildDocument(doc, edited));

  if ((data.activities ?? []).length > 0)
    doc = await stage("activity_table", () => fillActivityTable(doc, data.activities!, seqCounter));

  await stage("document_write", () => {
    zip.file("word/document.xml", doc);
    zip.file("word/_rels/document.xml.rels", relsXml);
    zip.file("[Content_Types].xml", contentTypesXml);
    return Promise.resolve();
  });
  return stage("docx_save", () => saveDocxZip(zip));
}

// ---------------------------------------------------------------------------
// Per-form population rules (anchored on the master's official wording)
// ---------------------------------------------------------------------------

function applyRules(
  formKey: string,
  p: Paragraph,
  i: number,
  all: Paragraph[],
  d: FormData,
  r: RefData,
  seq: { n: number }
): string | null {
  switch (formKey) {
    case "SF001":
      return sf001(p, i, all, d, r, seq);
    case "SF002":
      return sf002(p, i, all, d, r, seq);
    case "SF003":
      return sf003(p, i, all, d, r, seq);
    case "SF004":
      return sf004(p, i, all, d, r, seq);
    case "SF005":
      return sf005(p, i, all, d, r, seq);
    case "SF006":
      return sf006(p, i, all, d, r, seq);
    default:
      return null;
  }
}

function sf001(p: Paragraph, i: number, all: Paragraph[], d: FormData, r: RefData, seq: { n: number }): string | null {
  if (isBlankPara(p) && nextCaption(all, i) === "Date") return fillParagraph(p, d.date);
  if (pp(p.text).includes("duly recognized") && /_{6,}/.test(p.text))
    return fillBlanks(p.full, d.orgName);
  if (isBlankPara(p) && nextCaption(all, i).includes("Name of Organization"))
    return fillParagraph(p, d.orgName, "normal");
  if (isBlankPara(p) && nextCaption(all, i) === "Organization President")
    return signParagraph(p, r.president, seq);
  if (
    /_{6,}.*_{6,}/.test(p.text) &&
    nextCaption(all, i).includes("Adviser, Student Organization")
  ) {
    const adviser = r.advisers?.[0];
    return fillPairParagraph(p, [
      { name: adviser?.name ?? "", sig: adviser?.sig ? { ...adviser.sig, seq: seq.n++ } : null },
      { name: r.dean?.name ?? "", sig: r.dean?.sig ? { ...r.dean.sig, seq: seq.n++ } : null },
    ]);
  }
  return null;
}

function sf002(p: Paragraph, i: number, all: Paragraph[], d: FormData, r: RefData, seq: { n: number }): string | null {
  if (isBlankPara(p) && nextCaption(all, i) === "Date") return fillParagraph(p, d.date);
  if (pp(p.text).includes("wishes to seek renewal")) {
    const [a, b] = d.ay.split("-");
    let x = fillBlanks(p.full, d.orgName);
    x = x.split("20__ - 20__").join(`${a} - ${b}`);
    return x;
  }
  if (isBlankPara(p) && nextCaption(all, i) === "Organization President")
    return signParagraph(p, r.president, seq);
  if (isBlankPara(p) && nextCaption(all, i).includes("Name of Organization"))
    return fillParagraph(p, d.orgName, "normal");
  if (isBlankPara(p) && nextCaption(all, i).includes("Adviser/s Student Organization"))
    return signParagraph(p, r.advisers?.[0], seq);
  if (isBlankPara(p) && nextCaption(all, i).includes("Dean/Assoc. Dean, College of"))
    return signParagraph(p, r.dean, seq);
  return null;
}

function sf003(p: Paragraph, i: number, all: Paragraph[], d: FormData, r: RefData, seq: { n: number }): string | null {
  if (isBlankPara(p) && nextCaption(all, i) === "Date") return fillParagraph(p, d.date);
  if (pp(p.text).includes("duly recognized") && /_{6,}/.test(p.text))
    return fillBlanks(p.full, d.orgName);
  if (pp(p.text).includes("academic year") && /20__/.test(p.text))
    return p.full.split("20__-20__").join(d.ay);
  if (pp(p.text).includes("Name:")) return fillBlanks(p.full, d.adviserInfo?.name ?? "");
  if (pp(p.text).includes("College:")) return fillBlanks(p.full, d.adviserInfo?.college ?? "");
  if (pp(p.text).includes("Academic Rank:")) return fillBlanks(p.full, "");
  if (pp(p.text).includes("Home Address:")) return fillBlanks(p.full, "");
  if (pp(p.text).includes("Contact Number(s):")) return fillBlanks(p.full, "");
  if (pp(p.text).includes("Date:")) return fillBlanks(p.full, d.date);
  if (pp(p.text).includes("Signature:")) {
    const sref = r.advisers?.[0]?.sig;
    return placeSignatureAtBlank(p.full, sref ? { ...sref, seq: seq.n++ } : null);
  }
  if (isBlankPara(p) && nextCaption(all, i).includes("Dean/Assoc. Dean of College"))
    return signParagraph(p, r.dean, seq);
  return null;
}

function sf004(p: Paragraph, i: number, all: Paragraph[], d: FormData, r: RefData, seq: { n: number }): string | null {
  if (isBlankPara(p) && nextCaption(all, i).includes("Name of Organization"))
    return fillParagraph(p, d.orgName, "normal");
  if (pp(p.text).includes("Semester AY") && /20__/.test(p.text))
    return p.full.split("20__-20__").join(d.ay);
  if (/_{6,}.*_{6,}/.test(p.text) && pp(p.text).includes("Organization President")) {
    return fillPairParagraph(p, [
      { name: r.president?.name ?? "", sig: r.president?.sig ? { ...r.president.sig, seq: seq.n++ } : null },
      { name: r.secretary?.name ?? "", sig: r.secretary?.sig ? { ...r.secretary.sig, seq: seq.n++ } : null },
    ]);
  }
  if (isBlankPara(p) && nextCaption(all, i).includes("Organization Adviser(s)"))
    return signParagraph(p, r.advisers?.[0], seq);
  if (isBlankPara(p) && nextCaption(all, i).includes("Dean/Assoc. Dean"))
    return signParagraph(p, r.dean, seq);
  return null;
}

function sf005(p: Paragraph, i: number, all: Paragraph[], d: FormData, r: RefData, seq: { n: number }): string | null {
  if (pp(p.text).includes("Name of Organization") && /_{6,}/.test(p.text))
    return fillBlanks(p.full, d.orgName);
  if (/20__/.test(p.text) && pp(p.text).includes("Sem.")) {
    let x = p.full.split("20__-20__").join(d.ay);
    x = x.replace(/__\s*Sem\./, `${d.semester} Sem.`);
    return x;
  }
  const slot = memberSlotIndex(all, i);
  const members = r.members ?? [];
  if (slot !== null && slot < members.length) {
    const m = members[slot];
    const sig = m.sig ? { ...m.sig, seq: seq.n++ } : null;
    const body = [
      sig ? makeImageRun(sig.rId, sig.w, sig.h, sig.seq) : "",
      `<w:r>${rprFor(seq)}<w:br/><w:t xml:space="preserve">${esc(m.name)}</w:t><w:br/><w:t xml:space="preserve">${esc(m.studentNo)}</w:t><w:br/><w:t xml:space="preserve">${esc(m.courseYearSection)}</w:t></w:r>`,
    ].join("");
    return paraOpen(p.full) + p.pPr + body + "</w:p>";
  }
  if (/_{6,}.*_{6,}/.test(p.text) && nextCaption(all, i).includes("Organization Adviser")) {
    const [a, b] = r.advisers ?? [];
    return fillPairParagraph(p, [
      { name: a?.name ?? "", sig: a?.sig ? { ...a.sig, seq: seq.n++ } : null },
      { name: b?.name ?? "", sig: b?.sig ? { ...b.sig, seq: seq.n++ } : null },
    ]);
  }
  if (isBlankPara(p) && nextCaption(all, i).includes("Dean/Assoc. Dean of College"))
    return signParagraph(p, r.dean, seq);
  return null;
}

function sf006(p: Paragraph, i: number, all: Paragraph[], d: FormData, r: RefData, seq: { n: number }): string | null {
  if (isBlankPara(p) && nextCaption(all, i) === "Date") return fillParagraph(p, d.date);
  if (pp(p.text).includes("This certifies that"))
    return fillBlanks(p.full, d.certifiedStudent?.name ?? "");
  if (pp(p.text).includes("student taking up"))
    return fillBlanks(p.full, d.certifiedStudent?.courseYearSection ?? "");
  if (pp(p.text).includes("elected/appointed"))
    return fillBlanks(p.full, d.certifiedStudent?.position ?? "", d.orgName);
  if (isBlankPara(p) && nextCaption(all, i).includes("Organization Adviser(s)"))
    return signParagraph(p, r.advisers?.[0], seq);
  if (isBlankPara(p) && nextCaption(all, i).includes("Dean/Assoc. Dean of College"))
    return signParagraph(p, r.dean, seq);
  return null;
}

function rprFor(_seq: { n: number }): string {
  return "<w:rPr/>";
}

// ---------------------------------------------------------------------------
// SF-004 activity table: only the data row is cloned/filled; header, column
// widths, borders and the table grid stay untouched.
// ---------------------------------------------------------------------------

function fillActivityTable(doc: string, activities: NonNullable<FormData["activities"]>, seq: { n: number }): string {
  const tblRe = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/;
  const tbl = doc.match(tblRe)?.[0];
  if (!tbl) return doc;
  const rows = Array.from(tbl.matchAll(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g), (m) => m[0]);
  if (rows.length < 2 || !rows[0].includes("OBJECTIVE")) return doc;
  void seq;
  const proto = rows[1];
  const filled = activities.map((a) =>
    fillRow(proto, [a.objective, a.activities, a.description, a.persons, a.targetDate, a.budget])
  );
  const oldData = rows.slice(1).join("");
  const newTbl = tbl.replace(new RegExp(escapeRegExp(oldData)), filled.join(""));
  return doc.replace(tblRe, newTbl);
}

function fillRow(rowXml: string, values: string[]): string {
  const tcRe = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
  let out = "";
  let last = 0;
  let idx = 0;
  for (const m of rowXml.matchAll(tcRe)) {
    out += rowXml.slice(last, m.index);
    out += fillCell(m[0], values[idx] ?? "");
    idx += 1;
    last = m.index + m[0].length;
  }
  out += rowXml.slice(last);
  return out;
}

function fillCell(cellXml: string, value: string): string {
  const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/;
  const p = cellXml.match(pRe)?.[0];
  if (!p) return cellXml;
  const filled = fillParagraph({ full: p, text: paraText(p), pPr: pPrOf(p), offset: 0 }, value);
  return cellXml.replace(pRe, filled);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}