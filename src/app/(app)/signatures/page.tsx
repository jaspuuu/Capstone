import { redirect } from "next/navigation";
import { FileSignature, Hourglass } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { isAdminRole } from "@/lib/auth/rbac";
import { getSelectedAy } from "@/lib/ay-server";
import { getSignatureQueue } from "@/lib/signature-queue";
import { SignatureQueueCard } from "@/components/forms/signature-queue-card";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { timeAgo } from "@/lib/utils";
export const instant = false;

/**
 * Office signature work queue — every signature-routed document that is
 * currently waiting on an SOA/OSAS signatory step, across all organizations.
 * The queue is read-only; signing happens on the form page through the
 * backend-enforced policy.
 */
export default async function SignatureQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ ay?: string }>;
}) {
  const user = await requireUser();
  if (!isAdminRole(user.role)) redirect("/dashboard");

  const { ay: ayParam } = await searchParams;
  const ay = /^\d{4}-\d{4}$/.test(ayParam ?? "") ? ayParam! : await getSelectedAy();

  const items = await getSignatureQueue({ role: user.role, id: user.id }, { ay });

  const byOffice = (role: "OSAS" | "SOA") => items.filter((i) => i.requiredRole === role);
  const oldest = (list: typeof items) => list[0]; // queue is sorted oldest-first

  return (
    <div className="space-y-6">
      <PageHeader
        title="Signature Queue"
        description={`Every signature-routed document currently waiting on an office signatory step for AY ${ay}. Sign from the form itself.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={FileSignature} label="Awaiting office signature" value={items.length} iconTone="primary" hint={items.length > 0 ? `Oldest waiting ${timeAgo(oldest(items)?.awaitedSince)}` : "Nothing in queue"} />
        <StatCard label="Awaiting OSAS" value={byOffice("OSAS").length} icon={Hourglass} iconTone="info" hint={byOffice("OSAS")[0] ? `Oldest ${timeAgo(byOffice("OSAS")[0].awaitedSince)}` : "No documents at this step"} />
        <StatCard label="Awaiting SOA" value={byOffice("SOA").length} iconTone="gold" hint={byOffice("SOA")[0] ? `Oldest ${timeAgo(byOffice("SOA")[0].awaitedSince)}` : "No documents at this step"} />
      </div>

      <SignatureQueueCard items={items} total={items.length} title="Awaiting your office" />
    </div>
  );
}