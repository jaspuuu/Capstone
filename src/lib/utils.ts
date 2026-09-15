import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fullName(u: { firstName: string; lastName: string; middleName?: string | null }) {
  const mid = u.middleName ? ` ${u.middleName.charAt(0)}.` : "";
  return `${u.firstName} ${mid} ${u.lastName}`.trim();
}

export function initials(u: { firstName: string; lastName: string }) {
  return `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase();
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

/**
 * Current Philippine academic year (starts around August).
 * e.g. August 2026 -> "2026-2027", May 2026 -> "2025-2026".
 */
export function currentAcademicYear(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function nextAcademicYear(ay: string = currentAcademicYear()): string {
  const [start] = ay.split("-").map(Number);
  return `${start + 1}-${start + 2}`;
}

export function compareAcademicYear(a: string, b: string): number {
  const [aStart] = a.split("-").map(Number);
  const [bStart] = b.split("-").map(Number);
  return aStart - bStart;
}

/**
 * Semester of a date. 1st semester = June–December, 2nd = January–May
 * (Philippine academic calendar), derived from the month only.
 */
export function semesterOf(d: Date | string): 1 | 2 {
  return new Date(d).getMonth() >= 5 ? 1 : 2;
}

export function timeUntil(d: Date | string) {
  const diff = new Date(d).getTime() - Date.now();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  if (days > 0) return { days, hours, past: diff < 0 };
  return { days: 0, hours, past: diff < 0 };
}

/** Compact "3 days ago" style label for a past date. */
export function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Philippine peso formatting for budgets and expenses. */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(amount);
}
