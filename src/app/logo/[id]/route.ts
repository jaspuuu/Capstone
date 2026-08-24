import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readAttachmentFile } from "@/lib/attachments";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** Streams an organization's logo. Extension drives the content type. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const org = await db.organization.findUnique({
    where: { id },
    select: { logoStoredName: true },
  });
  if (!org?.logoStoredName) {
    return new NextResponse("Not found", { status: 404 });
  }
  const ext = org.logoStoredName.slice(org.logoStoredName.lastIndexOf("."));
  const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const bytes = await readAttachmentFile(org.logoStoredName);
  if (!bytes) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
