import "server-only";
import { db } from "@/lib/db";
import type { FormData } from "@/lib/docx/forms";
import { DRAFT_KEYS, type FormDraftData } from "@/lib/form-draft-data";

// ---------------------------------------------------------------------------
// Form draft overrides.
//
// The OFFICIAL DOCX remains the source of truth. Editable field values are
// stored as lightweight overrides per (form, org, AY) in `FormDocument.data`
// and merged into the derived FormData at export time. Signatures are never
// stored here — they live in the routed workflow and are bound to the rendered
// PDF. Editing is only possible while the document is still a draft (no step
// has been signed and no submission has started the workflow).
// ---------------------------------------------------------------------------

export type { FormDraftData };
export { DRAFT_KEYS };

/** Strip unknown / non-string keys so the stored JSON stays shape-safe. */
export function cleanDraftData(raw: unknown): FormDraftData {
  const out: FormDraftData = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const key of DRAFT_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim() !== "") out[key] = v.trim();
  }
  return out;
}

/** Load the stored draft overrides for a (form, org, AY), if any. */
export async function loadFormDraft(
  formKey: string,
  organizationId: string,
  academicYear: string
): Promise<{ data: FormDraftData; version: number; submittedAt: Date | null } | null> {
  const doc = await db.formDocument.findUnique({
    where: { formKey_organizationId_academicYear: { formKey, organizationId, academicYear } },
  });
  if (!doc) return null;
  return { data: cleanDraftData(doc.data), version: doc.version, submittedAt: doc.submittedAt };
}

/**
 * Merge stored overrides into the derived FormData before DOCX generation.
 * Only non-empty overrides are applied; signatures in FormData are preserved
 * untouched (editing never touches signature bytes).
 */
export function mergeDraftIntoFormData(data: FormData, draft: FormDraftData): FormData {
  const next: FormData = { ...data };
  if (draft.orgName) next.orgName = draft.orgName;
  if (draft.date) next.date = draft.date;
  if (draft.ay) next.ay = draft.ay;
  if (draft.semester) next.semester = draft.semester;
  if (draft.presidentName && data.president) next.president = { ...data.president, name: draft.presidentName };
  if (draft.secretaryName && data.secretary) next.secretary = { ...data.secretary, name: draft.secretaryName };
  if (draft.deanName && data.dean) next.dean = { ...data.dean, name: draft.deanName };
  if (data.advisers && data.advisers.length > 0 && draft.adviserName) {
    next.advisers = data.advisers.map((a, i) => (i === 0 ? { ...a, name: draft.adviserName! } : a));
  }
  if (data.adviserInfo) {
    next.adviserInfo = {
      name: draft.adviserInfoName ?? data.adviserInfo.name,
      college: draft.adviserInfoCollege ?? data.adviserInfo.college,
    };
  }
  if (data.certifiedStudent) {
    next.certifiedStudent = {
      ...data.certifiedStudent,
      name: draft.certifiedStudentName ?? data.certifiedStudent.name,
      courseYearSection:
        draft.certifiedStudentCourseYearSection ?? data.certifiedStudent.courseYearSection,
    };
  }
  return next;
}
