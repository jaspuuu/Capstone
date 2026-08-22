import "server-only";
import { db } from "@/lib/db";
import { getRequestMeta } from "@/lib/auth/guards";

export type AuditInput = {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  previousState?: unknown;
  newState?: unknown;
};

/**
 * Appends an immutable audit record (§32). Failures are logged but never
 * block the primary operation.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    const meta = await getRequestMeta();
    await db.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        entityLabel: input.entityLabel ?? null,
        previousState: (input.previousState ?? undefined) as never,
        newState: (input.newState ?? undefined) as never,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
  } catch (error) {
    console.error("[audit] failed to write audit log", error);
  }
}
