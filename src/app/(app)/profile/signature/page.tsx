import { PenLine } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { SignatureForm } from "./signature-form";

export const metadata = { title: "My signature · ORGanIZE" };

const METHOD_LABEL: Record<string, string> = {
  DRAW: "Drawn signature",
  UPLOAD: "Uploaded signature",
  TYPE: "Typed signature",
};

export default async function SignaturePage() {
  const session = await requireUser();
  const user = await db.user.findUnique({
    where: { id: session.id },
    select: {
      firstName: true,
      lastName: true,
      middleName: true,
      signatureImage: true,
      signatureTyped: true,
      signatureMethod: true,
    },
  });

  const hasSignature = Boolean(user?.signatureImage || user?.signatureTyped);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="My signature"
        description="Save an e-signature once and it appears on the SF forms wherever you are a signatory."
      />

      <Card>
        <CardHeader icon={PenLine} title="Saved signature" />
        <CardContent>
          <div className="mb-5 flex items-center gap-3">
            {hasSignature ? (
              <>
                <Badge tone="success">{METHOD_LABEL[user!.signatureMethod ?? ""] ?? "Saved"}</Badge>
                {user!.signatureImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/signatures/${session.id}`}
                    alt="Your saved signature"
                    className="max-h-[64px] rounded border border-line bg-white px-2 py-1"
                  />
                ) : (
                  <span className="text-[26px] leading-none text-gray-900" style={{ fontFamily: '"Great Vibes", cursive' }}>
                    {user!.signatureTyped}
                  </span>
                )}
              </>
            ) : (
              <Badge tone="neutral">No signature saved yet</Badge>
            )}
          </div>

          <SignatureForm
            current={{
              method: user?.signatureMethod ?? null,
              typed: user?.signatureTyped ?? null,
              hasImage: Boolean(user?.signatureImage),
            }}
            defaultName={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
