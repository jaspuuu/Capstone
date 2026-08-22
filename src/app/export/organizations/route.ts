import { currentAcademicYear } from "@/lib/utils";
import { auditExport, csvResponse, organizationTable, requireExporter, toCsv } from "@/lib/export";

export async function GET() {
  const { user, error } = await requireExporter();
  if (error) return error;

  const table = await organizationTable(user);
  const ay = currentAcademicYear();

  await auditExport(user, "organizations.csv", table.rows.length);

  return csvResponse(`organizations-${ay}.csv`, toCsv(table.headers, table.rows));
}
