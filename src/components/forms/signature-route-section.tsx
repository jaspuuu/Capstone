import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  authorizeCurrentSigner,
  describeSignatureStatus,
  ensureRoute,
  getRouteWithSteps,
} from "@/lib/signature-routing";
import { verifySignatureChain, type SignatureChainVerification } from "@/lib/signature-integrity";
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
  const me = await db.user.findUnique({
    where: { id: user.id },
    select: { signatureImage: true, signatureTyped: true },
  });
  const hasSavedSignature = Boolean(me?.signatureImage || me?.signatureTyped);
  const entityType = "SF";
  const entityId = sfRouteEntityId(formKey, orgId, ay);

  const route =
    (await getRouteWithSteps(entityType, entityId)) ??
    (await ensureRoute({ entityType, entityId, formKey, title, creatorId: user.id, activateFirst: false }));

  const verification: SignatureChainVerification = verifySignatureChain(
    route.steps.map((s) => ({
      order: s.order,
      role: s.role,
      signedAt: s.signedAt,
      status: s.status,
      signatureMethod: s.signatureMethod,
      signerId: s.signerId,
      chainHash: s.chainHash,
      prevChainHash: s.prevChainHash,
      contentHash: s.contentHash,
    }))
  );

  let viewerCanSignNow = false;
  try {
    await authorizeCurrentSigner({ entityType, entityId, userId: user.id });
    viewerCanSignNow = true;
  } catch {
    viewerCanSignNow = false;
  }

  const status = await describeSignatureStatus({ userId: user.id, entityType, entityId });

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
      hasSavedSignature={hasSavedSignature}
      verification={verification}
      status={status}
    />
  );
}
