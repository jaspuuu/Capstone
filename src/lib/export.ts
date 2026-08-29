import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { AuthUser } from "@/lib/auth/session";
import { getSessionUser } from "@/lib/auth/session";
import { can, scopedOrgWhere } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  ORG_STATE_META,
  ORG_TYPE_LABELS,
  RECOGNITION_STATUS_META,
} from "@/lib/constants";
import { deriveOrgState } from "@/lib/org-state";
import { currentAcademicYear, formatDateTime } from "@/lib/utils";

/**
 * Export helpers (CSV + Excel). Exports are limited to roles with analytics
 * access (OSAS, SOA, deans) and always respect record scoping.
 */

export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 correctly.
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function csvResponse(filename: string, csv: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function xlsxResponse(
  filename: string,
  headers: string[],
  rows: unknown[][]
): Promise<NextResponse> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Export");
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  sheet.columns.forEach((col) => {
    let max = 10;
    for (const cell of col.values ?? []) {
      max = Math.min(60, Math.max(max, String(cell ?? "").length + 2));
    }
    col.width = max;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Multi-sheet workbook export (e.g. the analytics matrix + alerts). */
export async function xlsxSheetsResponse(
  filename: string,
  sheets: { name: string; headers: string[]; rows: unknown[][] }[]
): Promise<NextResponse> {
  const workbook = new ExcelJS.Workbook();
  for (const s of sheets) {
    const sheet = workbook.addWorksheet(s.name);
    sheet.addRow(s.headers);
    sheet.getRow(1).font = { bold: true };
    for (const row of s.rows) sheet.addRow(row);
    sheet.columns.forEach((col) => {
      let max = 10;
      for (const cell of col.values ?? []) {
        max = Math.min(60, Math.max(max, String(cell ?? "").length + 2));
      }
      col.width = max;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Resolves the exporting user or returns an error response. */
export async function requireExporter(): Promise<
  { user: AuthUser; error: null } | { user: null; error: NextResponse }
> {
  const user = await getSessionUser();
  if (!user || user.isViewOnly) {
    return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!can(user, "analytics.view")) {
    return { user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, error: null };
}

export async function auditExport(user: AuthUser, label: string, rows: number): Promise<void> {
  await writeAudit({
    userId: user.id,
    action: "DATA_EXPORTED",
    entityType: "Export",
    entityLabel: label,
    newState: { rows },
  });
}

// ---------------------------------------------------------------------------
// Shared table builders used by both the CSV and Excel endpoints.
// ---------------------------------------------------------------------------

export type ExportTable = { headers: string[]; rows: unknown[][] };

export async function organizationTable(user: AuthUser): Promise<ExportTable> {
  const orgs = await db.organization.findMany({
    where: scopedOrgWhere(user),
    include: {
      college: { select: { name: true, code: true } },
      department: { select: { name: true } },
      recognitions: { select: { academicYear: true, status: true } },
    },
    orderBy: [{ college: { name: "asc" } }, { name: "asc" }],
  });

  const ay = currentAcademicYear();
  const rows = orgs.map((o) => {
    const state = deriveOrgState(o, o.recognitions);
    const currentRec = o.recognitions.find((r) => r.academicYear === ay);
    return [
      o.name,
      o.acronym ?? "",
      ORG_TYPE_LABELS[o.type] ?? o.type,
      o.college.code,
      o.department?.name ?? "",
      o.status === "ACTIVE" ? "Active" : "Inactive",
      ORG_STATE_META[state].label,
      currentRec ? RECOGNITION_STATUS_META[currentRec.status].label : "—",
      o.foundedYear ?? "",
    ];
  });

  return {
    headers: [
      "Organization",
      "Acronym",
      "Type",
      "College",
      "Department",
      "Status",
      `State (AY ${ay})`,
      "Current Application",
      "Founded Year",
    ],
    rows,
  };
}

export async function recognitionTable(
  user: AuthUser,
  ay: string | null
): Promise<ExportTable> {
  const recognitions = await db.recognition.findMany({
    where: {
      organization: scopedOrgWhere(user),
      ...(ay ? { academicYear: ay } : {}),
    },
    include: {
      organization: {
        select: {
          name: true,
          acronym: true,
          college: { select: { code: true } },
        },
      },
      decidedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ academicYear: "desc" }, { organization: { name: "asc" } }],
  });

  const rows = recognitions.map((r) => [
    r.organization.name,
    r.organization.acronym ?? "",
    r.organization.college.code,
    r.kind === "INITIAL" ? "Initial Recognition" : "Renewal",
    r.academicYear,
    RECOGNITION_STATUS_META[r.status].label,
    formatDateTime(r.submittedAt),
    formatDateTime(r.decidedAt),
    r.decidedBy ? `${r.decidedBy.firstName} ${r.decidedBy.lastName}` : "",
    r.remarks ?? "",
  ]);

  return {
    headers: [
      "Organization",
      "Acronym",
      "College",
      "Kind",
      "Academic Year",
      "Status",
      "Submitted",
      "Decided",
      "Decided By",
      "Remarks",
    ],
    rows,
  };
}
