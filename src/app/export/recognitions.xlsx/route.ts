import { auditExport, recognitionTable, requireExporter, xlsxResponse } from "@/lib/export";

export async function GET(request: Request) {
  const { user, error } = await requireExporter();
  if (error) return error;

  const url = new URL(request.url);
  const ay = url.searchParams.get("ay")?.trim() || null;

  const table = await recognitionTable(user, ay);

  await auditExport(user, "recognitions.xlsx", table.rows.length);

  return xlsxResponse(
    `recognitions${ay ? `-${ay}` : ""}.xlsx`,
    table.headers,
    table.rows,
  );
}
