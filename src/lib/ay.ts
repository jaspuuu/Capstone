import { currentAcademicYear } from "@/lib/utils";

/**
 * Academic-year selection shared by client and server. The chosen year lives
 * in a cookie written by the topbar YearPicker; server components read it
 * via getSelectedAy() from ay-server.ts.
 */
export const AY_COOKIE = "organize.ay";
const AY_RE = /^\d{4}-\d{4}$/;

/** Picker options: five years back through the current one, oldest first. */
export function availableAcademicYears(): string[] {
  const start = Number(currentAcademicYear().slice(0, 4));
  return Array.from({ length: 6 }, (_, i) => `${start - 5 + i}-${start - 4 + i}`);
}

export function isValidAy(value: string | undefined | null): boolean {
  return !!value && AY_RE.test(value);
}
