import JSZip from "jszip";

// ---------------------------------------------------------------------------
// Minimal OOXML toolkit for populating the immutable official DOCX masters.
// Only run-level text is touched inside existing paragraphs; paragraph
// properties (spacing, indents, alignment) and the document structure
// (sectPr, page size, margins, headers, footers) are never modified.
// ---------------------------------------------------------------------------

const RUN_RE = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
const PPR_RE = /<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>|<w:pPr\b[^>]*\/>/;
const RPR_RE = /<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>|<w:rPr\b[^>]*\/>/;

export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Concatenated text of every <w:t> inside a paragraph. */
export function paraText(parXml: string): string {
  const nodes = parXml.match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>|<w:t\b[^>]*\/>/g);
  if (!nodes) return "";
  return nodes
    .map((t) => t.replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/, "$1").replace(/<w:t\b[^>]*\/>/g, ""))
    .join("");
}

export function paraPPr(parXml: string): string {
  const m = parXml.match(PPR_RE);
  return m ? m[0] : "";
}

/** The paragraph's opening <w:p ...> tag (everything before its pPr/runs). */
export function paraOpen(parXml: string): string {
  const ppr = paraPPr(parXml);
  const openEnd = parXml.indexOf(">") + 1;
  const i = ppr ? parXml.indexOf(ppr) : openEnd;
  return parXml.slice(0, i > 0 ? i : openEnd);
}

/** Content of the paragraph between the pPr (or open tag when there is no
 * pPr) and the closing `</w:p>` — i.e. exactly the run-level region that a
 * walker replaces. Excludes both `</w:p>` and the pPr. */
function paraInner(parXml: string, pPr: string): string {
  const start = pPr ? parXml.indexOf(pPr) + pPr.length : parXml.indexOf(">") + 1;
  const end = parXml.indexOf("</w:p>", start);
  return end >= 0 ? parXml.slice(start, end) : parXml.slice(start);
}

/** First run's properties, used to inherit the blank's formatting. */
export function firstRunRPr(parXml: string): string {
  const run = parXml.match(RUN_RE);
  if (!run) return "";
  const m = run[0].match(RPR_RE);
  return m ? m[0] : "";
}

export function withoutBold(rPr: string): string {
  return rPr
    .replace(/<w:b\b[^>]*\/>/g, "")
    .replace(/<w:b\b[^>]*>[\s\S]*?<\/w:b>/g, "");
}

export function makeTextRun(rPr: string, text: string): string {
  return `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

/** Text run that first emits a line break (used under a signature image). */
export function makeBreakTextRun(rPr: string, text: string): string {
  return `<w:r>${rPr}<w:br/><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

/** Inline image run (signature).  w/h are in EMU (914400 per inch). */
export function makeImageRun(rId: string, w: number, h: number, seq: number): string {
  return `<w:r><w:drawing>
<wp:inline distT="0" distB="0" distL="0" distR="0">
<wp:extent cx="${w}" cy="${h}"/>
<wp:effectExtent l="0" t="0" r="0" b="0"/>
<wp:docPr id="${1000 + seq}" name="sig-${seq}"/>
<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="${1000 + seq}" name="sig-${seq}"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
</pic:pic>
</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

export type Paragraph = { full: string; offset: number; text: string; pPr: string };

/** Parse all top-level paragraphs of document.xml, keeping offsets. Empty
 * (self-closing `<w:p/>`) paragraphs and paragraphs NESTED inside other
 * elements (e.g. `<w:pict><v:textbox><w:txbxContent><w:p>…`) are skipped so
 * they can't swallow or duplicate their neighbours; a real paragraph spans
 * from its own open tag to the `</w:p>` that balances its nesting depth. */
export function listParagraphs(documentXml: string): Paragraph[] {
  const re = /<w:p\b[^>]*>|<w:p\b[^>]*\/>|<\/w:p>/g;
  const out: Paragraph[] = [];
  let start = -1;
  let depth = 0;
  for (const m of documentXml.matchAll(re)) {
    const tok = m[0];
    if (tok.startsWith("</w:p>")) {
      if (depth > 0) depth -= 1;
      if (depth === 0 && start >= 0) {
        const end = m.index! + tok.length;
        const full = documentXml.slice(start, end);
        out.push({ full, offset: start, text: paraText(full), pPr: paraPPr(full) });
        start = -1;
      }
    } else if (tok.endsWith("/>")) {
      // self-closing empty paragraph: no nesting, no content
    } else {
      if (depth === 0) start = m.index!;
      depth += 1;
    }
  }
  return out;
}

/** Rebuild document.xml from an edited copy of the parsed paragraphs. Each
 * edited paragraph REPLACES its entire original element, so the cursor always
 * advances past the original span (edited output may be shorter). */
export function rebuildDocument(documentXml: string, paras: TableRow[]): string {
  let out = "";
  let cursor = 0;
  for (const p of paras) {
    out += documentXml.slice(cursor, p.offset) + p.edited;
    cursor = p.offset + p.full.length;
  }
  return out + documentXml.slice(cursor);
}

export type TableRow = Paragraph & { edited: string };

/** Replaces every all-underscore run inside a paragraph. Everything else
 * (open tag, pPr, inter-run markup, tabs, line breaks, non-blank runs) is
 * preserved verbatim. resolve() returns the image + text for that blank, or
 * null to leave the run untouched. Returns the full <w:p> element. */
export function spliceRunBlanks(
  parXml: string,
  resolve: (
    text: string,
    index: number
  ) => { sig: { rId: string; w: number; h: number; seq: number } | null; text: string } | null
): string {
  const pPr = paraPPr(parXml);
  const inner = paraInner(parXml, pPr);
  let out = "";
  let last = 0;
  let replaced = 0;
  for (const m of inner.matchAll(RUN_RE)) {
    out += inner.slice(last, m.index);
    const runXml = m[0];
    const txt = paraText(runXml).trim();
    if (/^_{6,}$/.test(txt)) {
      const next = resolve(txt, replaced);
      if (next) {
        replaced += 1;
        if (next.sig) out += makeImageRun(next.sig.rId, next.sig.w, next.sig.h, next.sig.seq);
        out += runWithText(runXml, next.text);
      } else {
        out += runXml;
      }
    } else {
      out += runXml;
    }
    last = m.index + runXml.length;
  }
  out += inner.slice(last);
  if (replaced === 0) return parXml;
  return paraOpen(parXml) + pPr + out + "</w:p>";
}

function runWithText(runXml: string, text: string): string {
  const tRe = /<w:t\b[^>]*>[\s\S]*?<\/w:t>/;
  if (tRe.test(runXml)) return runXml.replace(tRe, `<w:t xml:space="preserve">${esc(text)}</w:t>`);
  return runXml.replace(/<\/w:r>/, `<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`);
}

/** Replace a blank paragraph's content (keeps pPr + first run formatting);
 * blanks embedded among other runs are spliced in place, fully-blank
 * paragraphs are rebuilt from the retained run formatting. */
export function fillParagraph(par: Paragraph, text: string, weight?: "normal" | "inherit"): string {
  const rPr = weight === "normal" ? withoutBold(firstRunRPr(par.full)) : firstRunRPr(par.full);
  const spliced = spliceRunBlanks(par.full, () => ({ sig: null, text }));
  if (spliced !== par.full) return spliced;
  return paraOpen(par.full) + par.pPr + makeTextRun(rPr, text) + "</w:p>";
}

/** Signature block: image above printed name inside the SAME official blank
 * paragraph (only its content is replaced; the paragraph itself stays). */
export function signatureParagraph(
  par: Paragraph,
  sig: { rId: string; w: number; h: number; seq: number } | null,
  name: string
): string {
  const base = withoutBold(firstRunRPr(par.full));
  const spliced = spliceRunBlanks(par.full, () => ({ sig, text: name }));
  if (spliced !== par.full) return spliced;
  const parts: string[] = [];
  if (sig) parts.push(makeImageRun(sig.rId, sig.w, sig.h, sig.seq));
  parts.push(makeBreakTextRun(base, name));
  return paraOpen(par.full) + par.pPr + parts.join("") + "</w:p>";
}

/** Replaces embedded all-underscore blanks inside a paragraph (pair layouts
 * like adviser/dean or president/secretary) with image-before-name runs while
 * preserving every tab/space between the two halves. */
export function fillPairParagraph(
  par: Paragraph,
  cells: Array<{ name: string; sig: { rId: string; w: number; h: number; seq: number } | null }>
): string {
  let cell = 0;
  const spliced = spliceRunBlanks(par.full, (text) => {
    const c = cells[cell];
    cell += 1;
    return c ? { sig: c.sig, text: c.name } : { sig: null, text };
  });
  if (spliced !== par.full) return spliced;
  return fillParagraph(par, "", "normal");
}

/** Signature placed at a blank that may live INSIDE a labelled run (e.g.
 * SF-003 "Signature: ______"): the run is split at the blank, the image is
 * inserted between the label and the empty suffix, nothing else changes. */
export function placeSignatureAtBlank(
  parXml: string,
  sig: { rId: string; w: number; h: number; seq: number } | null
): string {
  const pPr = paraPPr(parXml);
  const spliced = spliceRunBlanks(parXml, () => ({ sig, text: "" }));
  if (spliced !== parXml) return spliced;
  const inner = paraInner(parXml, pPr);
  let out = "";
  let last = 0;
  let done = false;
  for (const m of inner.matchAll(RUN_RE)) {
    out += inner.slice(last, m.index);
    const runXml = m[0];
    if (!done) {
      const tMatch = runXml.match(/<w:t\b[^>]*>[^<]*<\/w:t>/);
      if (tMatch) {
        const content = tMatch[0].replace(/^<w:t[^>]*>/, "").replace(/<\/w:t>$/, "");
        const blank = content.match(/_{6,}/);
        if (blank) {
          done = true;
          const prefix = content.slice(0, blank.index);
          const suffix = content.slice(blank.index! + blank[0].length);
          const open = runXml.slice(0, runXml.indexOf("<w:t"));
          const close = runXml.slice(runXml.indexOf("</w:t>") + "</w:t>".length);
          if (prefix) out += open + `<w:t xml:space="preserve">${esc(prefix)}</w:t>` + close;
          if (sig) out += makeImageRun(sig.rId, sig.w, sig.h, sig.seq);
          if (suffix) out += open + `<w:t xml:space="preserve">${esc(suffix)}</w:t>` + close;
          continue;
        }
      }
    }
    out += runXml;
  }
  out += inner.slice(last);
  return paraOpen(parXml) + pPr + out + "</w:p>";
}

/** Dimension detection for stored signature images. */
export function imageDims(buf: Buffer): { w: number; h: number } {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    if (w > 0 && h > 0) return { w, h };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      }
      const len = buf.readUInt16BE(i + 2);
      i += 2 + len;
    }
  }
  return { w: 600, h: 200 };
}

/** Signature render size: fixed height (~10mm), width keeps aspect ratio. */
export function signatureExtent(buf: Buffer): { wEmu: number; hEmu: number } {
  const { w, h } = imageDims(buf);
  const H = 411480; // 0.45in in EMU
  const ratio = h > 0 ? w / h : 2.4;
  return { wEmu: Math.round(H * ratio), hEmu: H };
}

// ---------------------------------------------------------------------------
// ZIP helpers (jszip). The master's other parts (styles, headers, footers,
// numbering, settings) are carried through untouched.
// ---------------------------------------------------------------------------

export async function loadDocxZip(buffer: Buffer): Promise<JSZip> {
  return JSZip.loadAsync(buffer, { checkCRC32: false });
}

/** Adds a binary part (signature image) + image relationship; returns rId. */
export async function addImagePart(
  zip: JSZip,
  image: Buffer,
  relsXml: string,
  contentTypesXml?: string | null
): Promise<{ rId: string; relsXml: string; contentTypesXml?: string | null }> {
  const names = Object.keys(zip.files);
  const mediaPrefix = "word/media/";
  const existing = names.filter((n) => n.startsWith(mediaPrefix)).length;
  const fileName = `${mediaPrefix}sig-${existing + 1}.png`;
  zip.file(fileName, image);

  // OPC requires every part extension to be declared in [Content_Types].xml or
  // strict consumers (Microsoft Word) reject the package as corrupt.
  if (contentTypesXml && !/<Default [^>]*Extension="png"/.test(contentTypesXml)) {
    contentTypesXml = contentTypesXml.replace(
      /<\/Types>/,
      `<Default Extension="png" ContentType="image/png"/></Types>`
    );
  }

  const maxId = Math.max(0, ...Array.from(relsXml.matchAll(/Id="rId(\d+)"/g), (m) => Number(m[1])));
  const rId = `rId${maxId + 1}`;
  const rel = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/sig-${existing + 1}.png"/>`;
  const updatedRels = relsXml.replace(/<\/Relationships>/, `${rel}</Relationships>`);
  return { rId, relsXml: updatedRels, contentTypesXml };
}

export async function saveDocxZip(zip: JSZip): Promise<Buffer> {
  return Buffer.from(
    await zip.generateAsync({
      type: "nodebuffer",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      compression: "DEFLATE",
    })
  );
}