import { currentAcademicYear } from "@/lib/utils";
import { auditExport, organizationTable, requireExporter, xlsxResponse } from "@/lib/export";

export async function GET() {
  const { user, error } = await requireExporter();
  if (error) return error;

  const table = await organizationTable(user);
  const ay = currentAcademicYear();

  await auditExport(user, "organizations.xlsx", table.rows.length);

  return xlsxResponse(`organizations-${ay}.xlsx`, table.headers, table.rows);
}
