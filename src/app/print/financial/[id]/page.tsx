import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import {
  FINANCIAL_FILE_KIND_LABELS,
  FINANCIAL_PROCESS_LABELS,
  FINANCIAL_STATUS_META,
} from "@/lib/financial";
import { SIGNATORY_LABELS } from "@/lib/form-routes";
import { verifySignatureChain } from "@/lib/signature-integrity";
import { formatDate, formatDateTime } from "@/lib/utils";
import { getSignaturesFor } from "@/lib/signatures";
import { PrintToolbar } from "@/components/forms/editable";
import { SfLetterhead, SfSig } from "@/components/forms/sf-chrome";
export const instant = false;

export const metadata: Metadata = { title: "Financial submission record" };

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Official print record of an *approved/archived* financial submission —
 * the OSAS-held copy of the compliance document, signed in sequence.
 */
export default async function PrintFinancialPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const submission = await db.financialSubmission.findUnique({
    where: { id },
    include: {
      requirement: { select: { code: true, name: true, description: true, process: true } },
      deadline: { select: { name: true, dueDate: true } },
      organization: {
        select: {
          id: true,
          name: true,
          acronym: true,
          collegeId: true,
          college: { select: { name: true } },
        },
      },
      comments: {
        include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!submission) notFound();

  const [org, routeRows, attachments] = await Promise.all([
    db.organization.findUnique({
      where: { id: submission.organizationId },
      select: {
        members: {
          where: { isCurrent: true },
          select: { userId: true },
        },
        advisers: { where: { isCurrent: true }, select: { adviserId: true } },
      },
    }),
    db.signatureRoute.findMany({
      where: { entityType: "FinancialSubmission", entityId: submission.id },
      include: {
        steps: {
          orderBy: { order: "asc" },
          include: { signer: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    }),
    db.attachment.findMany({
      where: { entityType: "FinancialSubmission", entityId: submission.id },
      orderBy: [{ version: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const isAdmin = can(user, "org.manage");
  const isMember = Boolean(org?.members.some((m) => m.userId === user.id));
  const isAdviser = Boolean(org?.advisers.some((a) => a.adviserId === user.id));
  const isDean =
    user.role === "DEAN" &&
    user.collegeId != null &&
    user.collegeId === submission.organization.collegeId;
  if (!isAdmin && !isMember && !isAdviser && !isDean) notFound();

  const validForPrint = submission.status === "APPROVED" || submission.status === "ARCHIVED";
  const route = routeRows[0];
  const statusLabel = FINANCIAL_STATUS_META[submission.status]?.label ?? submission.status;
  const orgDisplay = submission.organization.acronym
    ? `${submission.organization.name} (${submission.organization.acronym})`
    : submission.organization.name;
  const fmtDate = (d: Date | null) => (d ? formatDate(d) : "—");

  const sigIds = [
    ...(route?.steps.map((s) => s.signerId) ?? []),
    submission.decidedById ?? undefined,
  ];
  const sigMap = await getSignaturesFor(sigIds);

  if (!validForPrint) {
    return (
      <>
        <PrintToolbar backHref={`/organizations/${submission.organization.id}/financial`} title="Financial submission record" />
        <div className="mx-auto max-w-[210mm] p-8 text-center">
          <p className="text-lg font-bold">Not yet an official record</p>
          <p className="mt-2 text-sm">
            This submission is <b>{statusLabel}</b>. Only approved or archived submissions
            print as official records.
          </p>
        </div>
      </>
    );
  }

  const verification = route
    ? verifySignatureChain(
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
      )
    : null;

  return (
    <>
      <PrintToolbar backHref={`/organizations/${submission.organization.id}/financial`} title="Financial submission record" />
      <div className="sf-sheet">
        <SfLetterhead />

        <h1 className="mt-6 text-center font-bold">FINANCIAL SUBMISSION RECORD</h1>
        <p className="mt-1 text-center">
          {submission.requirement.name}
          {submission.requirement.code ? ` (${submission.requirement.code})` : ""}
          {" · "}AY {submission.academicYear}
        </p>
        <p className="text-center font-bold">{orgDisplay}</p>
        {submission.organization.college?.name && (
          <p className="text-center">{submission.organization.college.name}</p>
        )}

        <table className="sf-table mt-5 w-full">
          <tbody>
            <tr>
              <th className="w-[34mm]">Requirement</th>
              <td>
                {submission.requirement.name}
                {submission.requirement.description ? ` — ${submission.requirement.description}` : ""}
              </td>
            </tr>
            <tr>
              <th>Process</th>
              <td>{FINANCIAL_PROCESS_LABELS[submission.requirement.process]}</td>
            </tr>
            <tr>
              <th>Status</th>
              <td>
                {statusLabel}
                {submission.decidedAt ? ` · decided ${fmtDate(submission.decidedAt)}` : ""}
                {submission.archivedAt ? ` · archived ${fmtDate(submission.archivedAt)}` : ""}
              </td>
            </tr>
            <tr>
              <th>Version</th>
              <td>v{submission.version}</td>
            </tr>
            {submission.submittedAt && (
              <tr>
                <th>Submitted</th>
                <td>{formatDateTime(submission.submittedAt)}</td>
              </tr>
            )}
            {submission.deadline && (
              <tr>
                <th>Deadline</th>
                <td>
                  {submission.deadline.name} · {fmtDate(submission.deadline.dueDate)}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <h2 className="mt-5 font-bold">Attached documents ({attachments.length})</h2>
        {attachments.length === 0 ? (
          <p className="mt-1 italic">No documents attached.</p>
        ) : (
          <table className="sf-table mt-1 w-full">
            <thead>
              <tr>
                <th className="w-[14mm]">Version</th>
                <th className="w-[40mm]">Kind</th>
                <th>File</th>
                <th className="w-auto">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {attachments.map((a) => (
                <tr key={a.id}>
                  <td>v{a.version}</td>
                  <td>{FINANCIAL_FILE_KIND_LABELS[a.kind as never] ?? a.kind}</td>
                  <td>
                    {a.fileName}
                    <span className="text-content-secondary"> · {fileSize(a.sizeBytes)}</span>
                  </td>
                  <td>{formatDateTime(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {route && (
          <>
            <h2 className="mt-5 font-bold">Signature chain</h2>
            <table className="sf-table mt-1 w-full">
              <thead>
                <tr>
                  <th className="w-[32mm]">Signatory</th>
                  <th className="w-auto">Signed by</th>
                  <th className="w-[40mm]">Date</th>
                  <th className="w-auto">Comment</th>
                </tr>
              </thead>
              <tbody>
                {route.steps.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {SIGNATORY_LABELS[s.role]}
                      {s.signedAt ? (
                        <span className="mt-1 block">
                          {s.signer ? <SfSig name={`${s.signer.firstName.toUpperCase()} ${s.signer.lastName.toUpperCase()}`} caption="" ariaLabel={`${SIGNATORY_LABELS[s.role]} signature`} sig={sigMap.get(s.signer.id) ?? null} /> : null}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {s.status === "SIGNED" && s.signerId
                        ? `${s.signer?.firstName ?? ""} ${s.signer?.lastName ?? ""}`.trim() || "Signed"
                        : s.status === "CURRENT"
                          ? "Awaiting signature"
                          : s.status === "LOCKED"
                            ? "Locked"
                            : "Not signed"}
                    </td>
                    <td>{s.signedAt ? formatDate(s.signedAt) : "—"}</td>
                    <td>{s.comment ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="font-bold">
                    {verification?.ok
                      ? `Chain verified — ${verification.verified}/${route.steps.length} steps signed`
                      : "Signature chain broken or incomplete"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </>
        )}

        {submission.comments.length > 0 && (
          <>
            <h2 className="mt-5 font-bold">Comments</h2>
            <ul className="mt-1 space-y-1.5">
              {submission.comments.map((c) => (
                <li key={c.id} className="text-sm">
                  <b>
                    {c.author.firstName} {c.author.lastName}
                  </b>{" "}
                  <span className="text-[9pt] text-content-secondary">({formatDateTime(c.createdAt)})</span>
                  <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          </>
        )}

        <footer className="sf-footer mt-10 flex items-baseline justify-between text-[9pt]">
          <span>LSPU-OSAS · Financial Submission Record</span>
          <span>AY {submission.academicYear}</span>
          <span>Generated {formatDate(new Date())}</span>
        </footer>
      </div>
    </>
  );
}