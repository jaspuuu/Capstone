import { requireUser } from "@/lib/auth/guards";
import {
  authorizeCurrentSigner,
  ensureRoute,
  getRouteWithSteps,
} from "@/lib/signature-routing";
import { sfRouteEntityId } from "@/lib/form-routes";
import { SignatureRoutePanel } from "@/components/forms/signature-route-panel";

/**
 * Server-rendered signing section for an SF form instance (one route per
 * form+org+AY). Lazily creates the routing record on first view; the sign/
 * return buttons themselves are backend-enforced server actions.
 */
export async function SignatureRouteSection({
  formKey,
  orgId,
  ay,
  title,
}: {
  formKey: string;
  orgId: string;
  ay: string;
  title?: string;
}) {
  const user = await requireUser();
  const entityType = "SF";
  const entityId = sfRouteEntityId(formKey, orgId, ay);

  const route =
    (await getRouteWithSteps(entityType, entityId)) ??
    (await ensureRoute({ entityType, entityId, formKey, title, creatorId: user.id }));

  let viewerCanSignNow = false;
  try {
    await authorizeCurrentSigner({
      entityType,
      entityId,
      userId: user.id,
      org: { id: orgId, academicYear: ay, collegeId: (await getCollegeId(orgId)) ?? "" },
    });
    viewerCanSignNow = true;
  } catch {
    viewerCanSignNow = false;
  }

  return (
    <SignatureRoutePanel
      route={{
        id: route.id,
        formKey: route.formKey,
        state: route.state,
        version: route.version,
        steps: route.steps.map((s) => ({
          id: s.id,
          order: s.order,
          role: s.role,
          status: s.status,
          signerName:
            s.signerId && s.signer ? `${s.signer.firstName} ${s.signer.lastName}` : null,
          signedAt: s.signedAt,
          comment: s.comment,
        })),
      }}
      viewerId={user.id}
      viewerCanSignNow={viewerCanSignNow}
    />
  );
}

async function getCollegeId(orgId: string) {
  const { db } = await import("@/lib/db");
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { collegeId: true },
  });
  return org?.collegeId ?? null;
}
