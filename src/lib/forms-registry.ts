/**
 * Official LSPU-OSAS form-template registry.
 *
 * Single source of truth for the digitized official forms. Metadata mirrors
 * what is printed / governed by the reference DOCX files (the institution's
 * "Rev. 109 November 2020" series). The printed forms are FIXED templates:
 * the workflow layer may be modernized, the official document must not.
 *
 * Keep this module free of `server-only` imports so shared/client components
 * (e.g. sf-chrome) can consume the literals; every value below is plain data.
 */

export type FormTemplate = {
  /** Institutional document code, e.g. "LSPU-OSAS-SF-001". */
  formCode: string;
  /** Human name exactly as it appears on the official form. */
  formName: string;
  /** Official revision tag printed on every sheet. */
  templateVersion: string;
  /** Date the current series took effect (Rev. 109 = November 2020). */
  effectiveDate: string; // ISO yyyy-mm-dd
  /** Active / superseded (a new OSAS release creates a new version, never an edit). */
  status: "ACTIVE" | "SUPERSEDED" | "ARCHIVED";
  /** The exact footer line that appears on the printed form. */
  footerLiteral: string;
  /** Reference DOCX this digitization was validated against. */
  referenceFile: string;
};

export const FORM_TEMPLATES: readonly FormTemplate[] = [
  {
    formCode: "LSPU-OSAS-SF-001",
    formName: "Application for Organization Recognition/Renewal of Accredited Student Organization",
    templateVersion: "Rev. 109 November 2020",
    effectiveDate: "2020-11-01",
    status: "ACTIVE",
    footerLiteral: "LSPU-OSAS-SF-001 Rev. 109 November 2020",
    referenceFile: "001-APPLICATION-FOR-RECOGNITION-OR-RENEWAL-OF-ACCREDITED-STUDENT-ORGANIZATION.docx",
  },
  {
    formCode: "LSPU-OSAS-SF-002",
    formName: "Organization Renewal Form",
    templateVersion: "Rev. 109 November 2020",
    effectiveDate: "2020-11-01",
    status: "ACTIVE",
    footerLiteral: "LSPU-OSAS-SF-002 Rev. 109 November 2020",
    referenceFile: "002-RENEWAL-FORM.docx",
  },
  {
    formCode: "LSPU-OSAS-SF-003",
    formName: "Organization Adviser Commitment Form",
    templateVersion: "Rev. 109 November 2020",
    effectiveDate: "2020-11-01",
    status: "ACTIVE",
    footerLiteral: "LSPU-OSAS-SF-003 Rev. 109 November 2020",
    referenceFile: "005-COMMITMENT-FORM.docx",
  },
  {
    formCode: "LSPU-OSAS-SF-004",
    formName: "Plan of Activities",
    templateVersion: "Rev. 109 November 2020",
    effectiveDate: "2020-11-01",
    status: "ACTIVE",
    footerLiteral: "LSPU-OSAS-SF-004 Rev. 109 November 2020",
    referenceFile: "004-PLAN-OF-ACTIVITIES.docx",
  },
  {
    formCode: "LSPU-OSAS-SF-005",
    formName: "List of Members of the Organization",
    templateVersion: "Rev. 109 November 2020",
    effectiveDate: "2020-11-01",
    status: "ACTIVE",
    footerLiteral: "LSPU-OSAS-SF-005 Rev. 109 November 2020",
    referenceFile: "007-LIST-OF-MEMBERS.docx",
  },
  {
    formCode: "LSPU-OSAS-SF-006",
    formName: "Certification",
    templateVersion: "Rev. 109 November 2020",
    effectiveDate: "2020-11-01",
    status: "ACTIVE",
    footerLiteral: "LSPU-OSAS-SF-006 Rev. 109 November 2020",
    referenceFile: "006-CERTIFICATION.docx",
  },
];

export function getFormTemplate(formCode: string): FormTemplate | undefined {
  return FORM_TEMPLATES.find((t) => t.formCode === formCode);
}

/** Print-friendly metadata line shown OFF the official sheet (screen only). */
export function templateMetaLabel(t: FormTemplate): string {
  return `${t.formCode} · ${t.formName} · ${t.templateVersion} · ${t.status}`;
}

/** Prisma-friendly rows for the FormTemplate table (see scripts/seed-form-templates.ts). */
export function formTemplateSeedRows() {
  return FORM_TEMPLATES.map((t) => ({
    formCode: t.formCode,
    formName: t.formName,
    templateVersion: t.templateVersion,
    effectiveDate: new Date(`${t.effectiveDate}T00:00:00.000Z`),
    status: t.status,
    referenceFile: t.referenceFile,
  }));
}