import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True when a DOCX→PDF renderer is available on this host (Microsoft Word). */
export function pdfConversionAvailable(): boolean {
  return process.platform === "win32";
}

/** Why a PDF conversion could not complete. */
export type PdfConversionReason =
  | "word_busy"
  | "word_unavailable"
  | "conversion_failed";

export class PdfConversionError extends Error {
  readonly reason: PdfConversionReason;

  constructor(reason: PdfConversionReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PdfConversionError";
    this.reason = reason;
  }
}

// Microsoft Word is effectively single-instance per user session on Windows —
// serialize every conversion so concurrent exports never fight over the COM
// server.
let tail: Promise<unknown> = Promise.resolve();

/**
 * Render a populated official DOCX to PDF with the document-compatible
 * renderer (Microsoft Word), exactly as it would print. Returns the PDF bytes.
 *
 * Throws `PdfConversionError` with a `reason` when Word is busy (a Word window
 * is open in the same session), unavailable, or the conversion itself failed.
 */
export async function docxToPdf(docx: Buffer): Promise<Buffer> {
  const attempt = async () => {
    try {
      return await convertViaWord(docx);
    } catch (first) {
      // A stale/leftover automation instance (e.g. after a crash or timeout)
      // can make the next COM attach stall. Clean those windowless instances
      // out of this session once, wait a beat, then give Word another chance.
      await sweepAutomationInstances();
      await sleep(1500);
      try {
        return await convertViaWord(docx);
      } catch (second) {
        if (first instanceof PdfConversionError && second instanceof PdfConversionError) {
          // Prefer the first, more descriptive failure.
          throw first;
        }
        throw second;
      }
    }
  };
  const result = tail.then(attempt, attempt);
  tail = result.catch(() => undefined);
  return result;
}

async function sweepAutomationInstances(): Promise<void> {
  if (process.platform !== "win32") return;
  const script = [
    "$mySession = ([System.Diagnostics.Process]::GetCurrentProcess()).SessionId",
    "Get-Process WINWORD -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $mySession -and $_.MainWindowHandle -eq 0 } | Stop-Process -Force -ErrorAction SilentlyContinue",
  ].join("\n");
  await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    timeout: 30_000,
    maxBuffer: 1 * 1024 * 1024,
  }).catch(() => undefined);
}

async function convertViaWord(docx: Buffer): Promise<Buffer> {
  if (process.platform !== "win32") {
    throw new PdfConversionError(
      "word_unavailable",
      "DOCX→PDF via Microsoft Word is only available on Windows"
    );
  }
  const dir = await mkdtemp(join(tmpdir(), "opro-pdf-"));
  const docxPath = join(dir, `${randomUUID()}.docx`);
  const pdfPath = join(dir, `${randomUUID()}.pdf`);
  const statePath = join(dir, "state.txt");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Set-Content -LiteralPath $env:OPRO_STATE -Value 'start' -Encoding Ascii",
    // Sweep stale windowless automation instances out of this session so COM
    // does not attach to a half-dead server.
    "$mySession = ([System.Diagnostics.Process]::GetCurrentProcess()).SessionId",
    "Get-Process WINWORD -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $mySession -and $_.MainWindowHandle -eq 0 } | Stop-Process -Force -ErrorAction SilentlyContinue",
    "Start-Sleep -Milliseconds 300",
    // Ownership is decided by the returned instance's `Visible` flag: attaching
    // to the interactive user's Word yields a visible instance (never hide it,
    // never Quit it), while a fresh COM launch is hidden and ours to Quit.
    "$word = $null",
    "$doc = $null",
    "$owned = $false",
    "try {",
    "  $word = New-Object -ComObject Word.Application",
    "  $owned = -not $word.Visible",
    "  if ($owned) { $word.Visible = $false }",
    "  $word.DisplayAlerts = 0",
    "  Set-Content -LiteralPath $env:OPRO_STATE -Value $(if ($owned) { 'created-owned' } else { 'created-attached' }) -Encoding Ascii",
    "  Set-Content -LiteralPath $env:OPRO_STATE -Value 'opening' -Encoding Ascii",
    "  $doc = $word.Documents.Open($env:OPRO_DOCX, $false, $true)",
    "  Set-Content -LiteralPath $env:OPRO_STATE -Value 'exporting' -Encoding Ascii",
    "  $doc.ExportAsFixedFormat($env:OPRO_PDF, 17)",
    "  Set-Content -LiteralPath $env:OPRO_STATE -Value 'exported' -Encoding Ascii",
    "} finally {",
    // Cleanup must never mask a completed export, so every step is isolated.
    "  if ($doc) { try { $doc.Close($false) } catch { } }",
    "  if ($word) { try { if ($owned) { $word.Quit() } } catch { } }",
    "  if ($word) { try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null } catch { } }",
    "}",
  ].join("\n");
  try {
    await writeFile(docxPath, docx);
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", script], {
      env: { ...process.env, OPRO_DOCX: docxPath, OPRO_PDF: pdfPath, OPRO_STATE: statePath },
      timeout: 90_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    const pdf = await readFile(pdfPath);
    if (pdf.length === 0) throw new Error("Word produced an empty PDF");
    return pdf;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A PDF that exists and is non-empty is a success even if the PowerShell
    // child reported a pending cleanup error (which the finally suppresses but
    // can still surface as a nonzero exit).
    try {
      const pdf = await readFile(pdfPath);
      if (pdf.length > 0) return pdf;
    } catch {
      // fall through to failure handling
    }
    let state = "start";
    try {
      const raw = (await readFile(statePath, "utf8")).trim();
      if (raw) state = raw;
    } catch {
      // state file not written — could not even start Word
    }
    if (state === "exported") {
      throw new PdfConversionError("conversion_failed", `Word exported but the output was unreadable (${message})`, { cause: err });
    }
    if (state === "start") {
      throw new PdfConversionError(
        "word_unavailable",
        `Microsoft Word did not become available for conversion (${message})`,
        { cause: err }
      );
    }
    if (state === "created-attached") {
      throw new PdfConversionError(
        "word_busy",
        `Microsoft Word is open and could not complete the export in time (${message})`,
        { cause: err }
      );
    }
    throw new PdfConversionError("conversion_failed", `Word conversion failed at stage '${state}' (${message})`, {
      cause: err,
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}