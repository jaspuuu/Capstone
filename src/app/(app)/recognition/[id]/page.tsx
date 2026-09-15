import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { db } from "@/lib/db";

export const instant = false;

export default async function RecognitionRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const rec = await db.recognition.findUnique({
    where: { id },
    include: {
      organization: {
        select: {
          id: true,
          collegeId: true,
          members: { where: { isCurrent: true }, select: { userId: true } },
        },
      },
    },
  });
  if (!rec) notFound();

  // Scope enforcement: non-admins must be connected to this organization.
  if (!can(user, "org.manage") && user.role !== "DEAN") {
    const isMember = rec.organization.members.some((m) => m.userId === user.id);
    const isAdviser =
      user.role === "ADVISER_REGULAR" || user.role === "ADVISER_PARTTIME"
        ? await db.adviserAssignment.findFirst({
            where: { adviserId: user.id, organizationId: rec.organizationId, isCurrent: true },
          })
        : null;
    if (!isMember && !isAdviser) notFound();
  }
  if (
    user.role === "DEAN" &&
    rec.organization.collegeId !== user.collegeId &&
    !can(user, "org.manage")
  ) {
    notFound();
  }

  redirect(`/organizations/${rec.organizationId}/accreditation`);
}
