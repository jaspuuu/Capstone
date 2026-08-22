import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { readAttachmentFile } from "@/lib/attachments";

/**
 * Serves a user's saved signature image to any signed-in user. Signature
 * images only ever appear inside official SF forms, which already display
 * the signatory's name and position, so any active session may view them.
 * Files are never web-served directly.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const owner = await db.user.findUnique({
    where: { id: userId },
    select: { signatureImage: true },
  });
  if (!owner?.signatureImage) return new NextResponse("Not found", { status: 404 });

  const bytes = await readAttachmentFile(owner.signatureImage);
  if (!bytes) return new NextResponse("File missing", { status: 410 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="signature-${userId}.png"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
