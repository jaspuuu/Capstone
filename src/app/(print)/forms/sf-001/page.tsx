import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { currentAcademicYear } from "@/lib/utils";
import { canUseOrgForm } from "@/lib/forms-access";
import { Editable, PrintToolbar } from "@/components/forms/editable";
import {
  SfApprovers,
  SfDateBlank,
  SfFooter,
  SfLetterhead,
  SfSig,
  SignatureMark,
} from "@/components/forms/sf-chrome";
import { FormOrgPicker } from "@/components/forms/org-picker";
import { SignatureRouteSection } from "@/components/forms/signature-route-section";
import { getApproversSignatures, getSignaturesFor } from "@/lib/signatures";
export const instant = false;

export const metadata: Metadata = { title: "SF-001 · Application for Recognition/Renewal" };

const REQUIREMENTS = [
  "Letter for application for Organization Recognition (for new organizations) / Organization Renew Form (for organizations seeking renewal)",
  "Constitution and By-Laws of the Organization",
  "Plan of activities for one (1) year",
  "Accomplishment reports (for renewal of accreditation)",
  "Adviser(s) Commitment Form",
  "Certification from respective Dean/Associate Dean",
  "Financial Report (if any)",
];

/**
 * SF-001 — exact replica of the application letter incl. the CHED Memo
 * requirements checklist. Auto-fills org name and signature blocks.
 */
export default async function Sf001Page({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; ay?: string }>;
}) {
  const user = await requireUser();
  const { org: orgId, ay: ayParam } = await searchParams;
  const ay = /^\d{4}-\d{4}$/.test(ayParam ?? "") ? ayParam! : currentAcademicYear();
  if (!orgId) return <FormOrgPicker basePath="/forms/sf-001" />;

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      acronym: true,
      collegeId: true,
      members: {
        where: { isCurrent: true, academicYear: ay },
        select: { position: true, user: { select: { id: true, firstName: true, lastName: true } } },
      },
      advisers: {
        where: { isCurrent: true, academicYear: ay },
        select: {
          adviser: { select: { id: true, firstName: true, lastName: true, middleName: true } },
        },
      },
    },
  });
  if (!org) notFound();
  if (!(await canUseOrgForm(user, org))) notFound();

  const president = org.members.find((m) => m.position === "PRESIDENT")?.user;
  const dean = await db.organization.findUnique({
    where: { id: org.id },
    select: {
      college: { select: { dean: { select: { id: true, firstName: true, lastName: true } } } },
    },
  });
  const deanUser = dean?.college.dean ?? null;
  const [sigMap, approverSigs] = await Promise.all([
    getSignaturesFor([
      president?.id,
      ...org.advisers.map((a) => a.adviser.id),
      deanUser?.id,
    ]),
    getApproversSignatures(),
  ]);
  const orgDisplay = org.acronym ? `${org.name} (${org.acronym})` : org.name;

  return (
    <>
      <PrintToolbar backHref={`/organizations/${org.id}`} title="SF-001 Application for Recognition/Renewal" />

      <div className="mx-auto mb-4 mt-2 max-w-[210mm] px-4 print:hidden">
        <SignatureRouteSection formKey="SF001" orgId={org.id} ay={ay} />
      </div>

      <div className="sf-sheet">
        <SfLetterhead />

        <h1 className="mt-5 text-center font-bold">
          APPLICATION FOR ORGANIZATION RECOGNITION/RENEWAL OF ACCREDITED STUDENT ORGANIZATION
        </h1>

        <SfDateBlank />

        <div className="mt-4">
          <p className="font-bold">THE DIRECTOR/CHAIRPERSON</p>
          <p>Office of Student Affairs and Services</p>
          <p>LSPU</p>
        </div>

        <p className="mt-4">Sir/Madam:</p>

        <p className="mt-3 indent-10">
          I have the honor to apply for recognition/renewal of the organization,{" "}
          <Editable initial={orgDisplay} minWidth="60mm" center ariaLabel="Name of Organization" />, to
          be duly recognized by Laguna State Polytechnic University.
        </p>

        <p className="mt-3 indent-10">
          In compliance with CHED Memo Order No.9 s. 2013, Subj.: Enhanced Policies &amp; Guidelines on
          Student Affairs and Services (Article VIII-Student Development, Section 19. Student
          Organizations and Activities), I am submitting for proper action the requirements for
          recognition and accreditation, to wit:
        </p>

        <ul className="mt-3 space-y-1">
          {REQUIREMENTS.map((r) => (
            <li key={r} className="flex items-baseline gap-2">
              <span>{r}</span>
              <span className="mx-1 min-w-[8mm] flex-1 border-b border-dotted border-black" aria-hidden />
              <span className="whitespace-nowrap">- 4 copies</span>
            </li>
          ))}
        </ul>

        <p className="mt-3">
          It is understood that the provision to the LSPU Supplementary Rules and Regulations Governing
          Student Organization in this official Recognition is good only for one (1) school year,
          subject to renewal unless revoked prior to this expiration.
        </p>

        <p className="mt-4 ml-auto w-fit mr-[30mm]">Respectfully yours,</p>
        <div className="ml-auto mr-[20mm] w-fit text-center">
          <SfSig
            name={president ? `${president.firstName} ${president.lastName}` : ""}
            caption="Organization President"
            width="55mm"
            sig={president ? sigMap.get(president.id) : null}
            ariaLabel="Organization President signature"
          />
        </div>
        <div className="ml-auto mr-[20mm] mt-5 w-fit text-center">
          <Editable initial={orgDisplay} minWidth="55mm" center ariaLabel="Name of Organization" />
          <p className="mt-0.5">Name of Organization</p>
        </div>

        <p className="mt-6 font-bold">NOTED:</p>
        <div className="mt-6 flex justify-between gap-8 pr-[10mm]">
          <div className="space-y-6">
            {org.advisers.length > 0 ? (
              org.advisers.map((a, i) => (
                <div key={i}>
                  {sigMap.get(a.adviser.id) && <SignatureMark sig={sigMap.get(a.adviser.id)!} />}
                  <Editable
                    initial={`${a.adviser.firstName}${a.adviser.middleName ? ` ${a.adviser.middleName}` : ""} ${a.adviser.lastName}`}
                    minWidth="55mm"
                    ariaLabel="Adviser signature"
                  />
                </div>
              ))
            ) : (
              <Editable initial="" minWidth="55mm" ariaLabel="Adviser signature" />
            )}
            <p>Adviser, Student Organization</p>
          </div>
          <SfSig
            name={deanUser ? `${deanUser.firstName} ${deanUser.lastName}` : ""}
            caption="Dean/Assoc. Dean of College"
            width="55mm"
            sig={deanUser ? sigMap.get(deanUser.id) : null}
            ariaLabel="Dean signature"
          />
        </div>

        <SfApprovers
          coordinatorSig={approverSigs.coordinator}
          directorSig={approverSigs.director}
        />
        <SfFooter code="LSPU-OSAS-SF-001" />
      </div>
    </>
  );
}
