// Shared, client-safe draft metadata. Plain data only — no server imports.
// Server-only helpers (database access, FormData merge) live in form-draft.ts.

export type FormDraftData = {
  orgName?: string;
  date?: string;
  ay?: string;
  semester?: string;
  presidentName?: string;
  secretaryName?: string;
  deanName?: string;
  adviserName?: string;
  adviserInfoName?: string;
  adviserInfoCollege?: string;
  certifiedStudentName?: string;
  certifiedStudentCourseYearSection?: string;
};

export const FORM_DRAFT_FIELDS: ReadonlyArray<{ key: keyof FormDraftData; label: string }> = [
  { key: "orgName", label: "Organization name" },
  { key: "date", label: "Date" },
  { key: "ay", label: "Academic year" },
  { key: "semester", label: "Semester" },
  { key: "presidentName", label: "President — name" },
  { key: "secretaryName", label: "Secretary — name" },
  { key: "deanName", label: "Dean — name" },
  { key: "adviserName", label: "Adviser — name" },
  { key: "adviserInfoName", label: "Adviser info — name" },
  { key: "adviserInfoCollege", label: "Adviser info — college" },
  { key: "certifiedStudentName", label: "Certified student — name" },
  { key: "certifiedStudentCourseYearSection", label: "Certified student — course/yr/sec" },
];

/** Scalar keys that can be overridden (safe to store as plain JSON strings). */
export const DRAFT_KEYS: ReadonlyArray<keyof FormDraftData> = FORM_DRAFT_FIELDS.map((f) => f.key);