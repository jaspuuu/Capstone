import { auditExport, requireExporter, xlsxSheetsResponse } from "@/lib/export";
import { currentAcademicYear } from "@/lib/utils";
import { ALERT_HEADERS, alertRows, buildAnalyticsExport } from "@/lib/analytics-export";

export async function GET(request: Request) {
  const { user, error } = await requireExporter();
  if (error) return error;

  const url = new URL(request.url);
  const sp = url.searchParams;
  const toStr = (v: string | null) => v?.trim() ?? "";
  const ay = toStr(sp.get("ay")) || currentAcademicYear();

  const table = await buildAnalyticsExport(user, {
    ay,
    org: toStr(sp.get("org")) || undefined,
    type: toStr(sp.get("type")) || undefined,
    college: toStr(sp.get("college")) || undefined,
    rec: toStr(sp.get("rec")) || undefined,
  });

  await auditExport(user, `analytics-${ay}.xlsx`, table.orgCount);

  return xlsxSheetsResponse(`analytics-${ay}.xlsx`, [
    { name: "Compliance matrix", headers: table.matrixHeaders, rows: table.matrixRows },
    { name: "Alerts", headers: ALERT_HEADERS, rows: alertRows(table.alerts) },
  ]);
}