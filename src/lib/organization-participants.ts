import { db } from "@/lib/db";
import { MEMBER_POSITION_LABELS } from "@/lib/constants";

/** A selectable roster row for the accomplishment report participant picker. */
export type ParticipantOption = {
  userId: string;
  name: string;
  positionLabel: string | null;
  isOfficer: boolean;
};

const isOfficerPosition = (p: string) => p === "PRESIDENT" || p === "SECRETARY";

/**
 * Current members of the given organizations, grouped by organization id,
 * officers first. Serves the report participant picker.
 */
export async function participantsByOrganization(
  organizationIds: string[]
): Promise<Record<string, ParticipantOption[]>> {
  if (organizationIds.length === 0) return {};

  const members = await db.organizationMember.findMany({
    where: { organizationId: { in: organizationIds }, isCurrent: true },
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  const grouped: Record<string, ParticipantOption[]> = {};
  for (const m of members) {
    const opt: ParticipantOption = {
      userId: m.userId,
      name: `${m.user.firstName} ${m.user.lastName}`.trim(),
      positionLabel: isOfficerPosition(m.position)
        ? MEMBER_POSITION_LABELS[m.position] ?? null
        : null,
      isOfficer: isOfficerPosition(m.position),
    };
    (grouped[m.organizationId] ??= []).push(opt);
  }
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => Number(b.isOfficer) - Number(a.isOfficer));
  }
  return grouped;
}