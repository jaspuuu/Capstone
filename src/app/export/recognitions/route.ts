import { auditExport, csvResponse, recognitionTable, requireExporter, toCsv } from "@/lib/export";

export async function GET(request: Request) {
  const { user, error } = await requireExporter();
  if (error) return error;

  const url = new URL(request.url);
  const ay = url.searchParams.get("ay")?.trim() || null;

  const table = await recognitionTable(user, ay);

  await auditExport(user, "recognitions.csv", table.rows.length);

  return csvResponse(
    `recognitions${ay ? `-${ay}` : ""}.csv`,
    toCsv(table.headers, table.rows),
  );
}
