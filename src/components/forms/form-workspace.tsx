import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getFormTemplate } from "@/lib/forms-registry";
import {
  ensureRoute,
  getRouteWithSteps,
  authorizeCurrentSigner,
} from "@/lib/signature-routing";
import { sfRouteEntityId, SIGNATORY_LABELS } from "@/lib/form-routes";
import { loadFormDraft } from "@/lib/form-draft";
import { canGovernForms, routeIsEditableDraft } from "@/lib/actions/form-draft";
import { FormWorkspaceClient, type FormVersionEvent } from "@/components/forms/form-workspace-client";
import type { FormLifecycle } from "@/components/forms/document-status-bar";
import { SignatureRouteSection } from "@/components/forms/signature-route-section";

export type SfFormKey = "SF001" | "SF002" | "SF003" | "SF004" | "SF005" | "SF006";

function fmtIso(d: Date): string {
  return d.toISOString();
}

/**
 * Server shell for the three-mode official form workspace. Loads everything
 * the client needs (org display data, draft overrides, route lifecycle, the
 * viewer's signing eligibility) and slots in the server-rendered signature
 * workflow panel. All authorization is derived from the database on this side.
 */
export async function FormWorkspace({
  formKey,
  orgId,
  ay,
  backHref,
}: {
  formKey: SfFormKey;
  orgId: string;
  ay: string;
  backHref: string;
}) {
  const user = await requireUser();
  const code = `LSPU-OSAS-${formKey}`;
  const template = getFormTemplate(code);
  const formTitle = template?.formName ?? formKey;

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, acronym: true },
  });
  const orgDisplayName = org ? (org.acronym ? `${org.name} (${org.acronym})` : org.name) : orgId;

  const entityType = "SF";
  const entityId = sfRouteEntityId(formKey, orgId, ay);

  // Lazy-create the routing record (all steps LOCKED) so the tracker exists;
  // nothing is signable until the document is submitted (activating step 1).
  const route =
    (await getRouteWithSteps(entityType, entityId)) ??
    (await ensureRoute({ entityType, entityId, formKey, title: code, creatorId: user.id, activateFirst: false }));

  const draft = await loadFormDraft(formKey, orgId, ay);
  const isOfficerOrManager = await canGovernForms(user.id, orgId);
  const editable = isOfficerOrManager && (await routeIsEditableDraft(entityType, entityId));
  const submittedAt = draft?.submittedAt;

  // Submit is only meaningful while the document is still an INITIAL draft —
  // nothing has been submitted yet (no submission marker, no CURRENT step, no
  // signatures). A returned-for-revision document is resubmitted via the
  // workflow panel; a completed/rejected document can never be (re)submitted.
  const canSubmit = isOfficerOrManager && editable && !submittedAt;

  // Stage computation (lifecycle). Workflow status and SIGNATURE status are
  // separate: APPROVED may ONLY be shown when every configured required
  // signature is complete (defensive — a route flagged COMPLETED whose steps
  // are not all SIGNED falls back to "awaiting signatures", never Approved).
  // 0 Draft · 1 Submitted · 2 For Signature · 3 Revision · 4 Approved/Rejected.
  const signedCount = route.steps.filter((s) => s.status === "SIGNED").length;
  const requiredCount = route.steps.length;
  const allRequiredSigned = requiredCount > 0 && signedCount === requiredCount;

  let lifecycle: FormLifecycle;
  if (route.state === "COMPLETED" && allRequiredSigned) {
    lifecycle = { stage: 4, label: "Approved" };
  } else if (route.state === "REJECTED") {
    lifecycle = { stage: 4, label: "Rejected", rejected: true };
  } else if (route.state === "RETURNED_FOR_REVISION") {
    lifecycle = { stage: 3, label: "Revision" };
  } else if (route.state === "COMPLETED") {
    // Data-integrity guard: the route reached COMPLETED prematurely — never
    // advertise approval while required signatories are still unsigned.
    lifecycle = { stage: 2, label: "Awaiting signatures" };
  } else if (!submittedAt) {
    lifecycle = { stage: 0, label: "Draft" };
  } else if (signedCount === 0) {
    lifecycle = { stage: 1, label: "Submitted" };
  } else {
    lifecycle = { stage: 2, label: "For Signature" };
  }
  if (requiredCount > 0) {
    lifecycle = { ...lifecycle, signatureProgress: { signed: signedCount, total: requiredCount } };
  }

  // Version-history timeline: draft snapshots + the SUBMITTED marker + signed
  // workflow steps (President signed, Adviser signed, …).
  const versions: FormVersionEvent[] = [];
  const formDoc = await db.formDocument.findUnique({
    where: { formKey_organizationId_academicYear: { formKey, organizationId: orgId, academicYear: ay } },
    include: { versions: { orderBy: { createdAt: "asc" } } },
  });
  for (const v of formDoc?.versions ?? []) {
    versions.push({
      id: `d${v.id}`,
      version: v.version,
      label: v.action === "SUBMITTED" ? "Submitted" : "Draft",
      note: v.note ?? undefined,
      timestamp: fmtIso(v.createdAt),
      kind: v.action === "SUBMITTED" ? "submit" : "draft",
    });
  }
  for (const s of route.steps) {
    if (s.status === "SIGNED" && s.signedAt) {
      versions.push({
        id: `s${s.id}`,
        version: 0,
        label: `${SIGNATORY_LABELS[s.role] ?? s.role} signed`,
        timestamp: fmtIso(s.signedAt),
        kind: "signature",
      });
    }
  }

  // Is the current viewer the awaited signatory right now?
  let viewerCanSignNow = false;
  try {
    await authorizeCurrentSigner({ entityType, entityId, userId: user.id });
    viewerCanSignNow = true;
  } catch {
    viewerCanSignNow = false;
  }

  const basename = encodeURIComponent(formKey.toLowerCase());
  const ayParam = encodeURIComponent(ay);
  const cacheBust = draft ? `&v=${draft.version}` : "";
  const docxHref = `/api/org/${orgId}/documents/${basename}/export?ay=${ayParam}${cacheBust}`;
  const pdfHref = `${docxHref}&format=pdf`;

  return (
    <FormWorkspaceClient
      formKey={formKey}
      orgId={orgId}
      ay={ay}
      backHref={backHref}
      code={code}
      formTitle={formTitle}
      orgDisplayName={orgDisplayName}
      docxHref={docxHref}
      pdfHref={pdfHref}
      lifecycle={lifecycle}
      canEdit={editable}
      canSubmit={canSubmit}
      viewerCanSignNow={viewerCanSignNow}
      draft={draft?.data ?? {}}
      draftVersion={draft?.version ?? 0}
      versions={versions}
      signatureSection={
        <SignatureRouteSection formKey={formKey} orgId={orgId} ay={ay} title={code} />
      }
    />
  );
}