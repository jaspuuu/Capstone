import { join } from "node:path";

// ---------------------------------------------------------------------------
// Official master templates — filename registry + SHA-256 integrity manifest.
// Kept free of `server-only` so verification scripts and the export pipeline
// can share the exact same constants and hashing logic.
// ---------------------------------------------------------------------------

export const MASTER_FILES: Record<string, string> = {
  SF001: "001-APPLICATION-FOR-RECOGNITION-OR-RENEWAL-OF-ACCREDITED-STUDENT-ORGANIZATION.docx",
  SF002: "002-RENEWAL-FORM.docx",
  SF003: "005-COMMITMENT-FORM.docx",
  SF004: "004-PLAN-OF-ACTIVITIES.docx",
  SF005: "007-LIST-OF-MEMBERS.docx",
  SF006: "006-CERTIFICATION.docx",
};

/**
 * SHA-256 manifest of the official OSAS/ISO masters. Generation refuses to
 * run when a master's hash no longer matches, so the printed document always
 * originates from a byte-identical, unmodified official template. Recompute
 * with `Get-FileHash -Algorithm SHA256 templates/osas/*.docx` only when the
 * official master is intentionally replaced (and commit the new manifest).
 */
export const MASTER_HASHES: Record<string, string> = {
  SF001: "6f5be3308720385e16c1754a90ab85105fbbdeeb49c932e67d40347c590f6e7e",
  SF002: "078189cfdab6818fc5241ce3f6475d84b0656b9027ffdb26d0ddcbf0ac37e029",
  SF003: "f81d7191620124c491641a0e39fa7c0ea552a38b70cc331692eb5c8ab58e14be",
  SF004: "6f4772d842fe6a430a5ec09bfe7264cd795939e7e75b0bca15754ae461d8553c",
  SF005: "4198782938bc8b9e1c333f67f57fddcefbd3d3d031ab39a8214eba92a897b100",
  SF006: "56ad9c4e291078ce99eeb1c2397a1e76384ebeab2f5e52ea18eb3a4d57810833",
};

export function masterTemplateDir(): string {
  return process.env.OSAS_TEMPLATES_DIR ?? join(process.cwd(), "templates", "osas");
}

export function masterTemplateFile(formKey: string): string {
  const file = MASTER_FILES[formKey];
  if (!file) throw new Error(`No master template registered for ${formKey}`);
  return file;
}