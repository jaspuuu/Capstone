import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { STORAGE_DIR, safeDownloadName } from "@/lib/attachments";
import { canViewAttachments, loadAttachableParent } from "@/lib/attachment-access";

/**
 * Authenticated attachment downloads. Files are never web-served directly;
 * every request re-checks record scoping.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const parent = await loadAttachableParent(attachment.entityType, attachment.entityId);
  if (!parent) return new NextResponse("Not found", { status: 404 });

  const allowed = await canViewAttachments(user, parent.organizationId, parent.organization.collegeId);
  if (!allowed) return new NextResponse("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(STORAGE_DIR, attachment.storedName));
  } catch {
    return new NextResponse("File missing", { status: 410 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${safeDownloadName(attachment.fileName)}"`,
      // Downloads are authorized per user; never cache shared.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
