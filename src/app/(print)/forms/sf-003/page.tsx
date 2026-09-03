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
import { getApproversSignatures, getSignaturesFor, hasSignature } from "@/lib/signatures";
import { getSignedRolesForSf } from "@/lib/signature-routing";
export const instant = false;

export const metadata: Metadata = { title: "SF-003 · Organization Adviser Commitment Form" };

/**
 * SF-003 — exact replica of the adviser commitment letter. Name, college and
 * academic rank prefill from the organization's current adviser (or the
 * signed-in adviser); remaining details stay as editable blanks.
 */
export default async function Sf003Page({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; ay?: string }>;
}) {
  const user = await requireUser();
  const { org: orgId, ay: ayParam } = await searchParams;
  const ay = /^\d{4}-\d{4}$/.test(ayParam ?? "") ? ayParam! : currentAcademicYear();
  if (!orgId) return <FormOrgPicker basePath="/forms/sf-003" />;

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      acronym: true,
      collegeId: true,
      college: { select: { name: true, dean: { select: { id: true, firstName: true, lastName: true } } } },
      advisers: {
        where: { isCurrent: true, academicYear: ay },
        select: {
          adviser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              positionTitle: true,
              departmentId: true,
              department: { select: { college: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!org) notFound();
  if (!(await canUseOrgForm(user, org))) notFound();

  // Prefill the commitment details with the signed-in adviser when possible.
  const self =
    (user.role === "ADVISER_REGULAR" || user.role === "ADVISER_PARTTIME") &&
    org.advisers.some((a) => a.adviser.lastName === user.lastName && a.adviser.firstName === user.firstName);
  const primary = self
    ? org.advisers.find((a) => a.adviser.lastName === user.lastName)
    : org.advisers[0];

  const adviserName = primary
    ? `${primary.adviser.firstName}${primary.adviser.middleName ? ` ${primary.adviser.middleName}` : ""} ${primary.adviser.lastName}`
    : "";
  const dean = org.college.dean;
  const orgDisplay = org.acronym ? `${org.name} (${org.acronym})` : org.name;
  const [ayStart, ayEnd] = ay.split("-");
  const [sigMap, approverSigs, signedRoles] = await Promise.all([
    getSignaturesFor([primary?.adviser.id, dean?.id]),
    getApproversSignatures(),
    getSignedRolesForSf("SF003", org.id, ay),
  ]);
  const signed = (role: string) => signedRoles.has(role);
  const primarySig = primary && signed("SENIOR_ADVISER") ? sigMap.get(primary.adviser.id) ?? null : null;
  const deanSig = dean && signed("DEAN") ? sigMap.get(dean.id) ?? null : null;

  return (
    <>
      <PrintToolbar backHref={`/organizations/${org.id}`} title="SF-003 Organization Adviser Commitment Form" />

      <div className="mx-auto mb-4 mt-2 max-w-[210mm] px-4 print:hidden">
        <SignatureRouteSection formKey="SF003" orgId={org.id} ay={ay} />
      </div>

      <div className="sf-sheet">
        <SfLetterhead />

        <h1 className="mt-5 text-center font-bold">ORGANIZATION ADVISER COMMITMENT FORM</h1>

        <SfDateBlank />

        <div className="mt-4">
          <p className="font-bold">THE DIRECTOR/CHAIRPERSON</p>
          <p className="font-bold">OFFICE OF STUDENT AFFAIRS AND SERVICES</p>
          <p className="font-bold">LSPU</p>
        </div>

        <p className="mt-4 indent-10 font-bold">Thru: The Coordinator, Student Organization Unit</p>

        <p className="mt-4">Sir/Madam:</p>

        <p className="mt-3 indent-10">
          This letter is in connection with the application for recognition/renewal of{" "}
          <Editable initial={orgDisplay} minWidth="50mm" center ariaLabel="Name of Organization" /> as
          duly recognized LSPU Organization.
        </p>

        <p className="mt-3 indent-10">
          I, the undersigned, have committed to serve as the organization&rsquo;s Adviser for the
          academic year 20<Editable initial={ayStart.slice(2)} minWidth="7mm" center ariaLabel="AY start" />{" "}
          - 20<Editable initial={ayEnd.slice(2)} minWidth="7mm" center ariaLabel="AY end" />, and shall
          therefore assume full responsibility as provided in the guidelines for the recognition of
          student organizations.
        </p>

        <p className="mt-3 indent-10">
          Furthermore, I certify to the correctness and completeness of the documents attached to the
          organization application for recognition.
        </p>

        <p className="mt-5 ml-auto w-fit mr-[30mm]">Very respectfully yours,</p>

        <div className="ml-auto mr-0 mt-4 w-fit space-y-1">
          <p>
            Name:{" "}
            <Editable initial={adviserName} minWidth="55mm" ariaLabel="Adviser name" />
          </p>
          <p>
            Signature:{" "}
            {hasSignature(primarySig) && <SignatureMark sig={primarySig!} inline />}
            <Editable initial="" minWidth="52mm" ariaLabel="Adviser signature" />
          </p>
          <p>
            College:{" "}
            <Editable
              initial={
                primary?.adviser.department?.college.name ??
                (user.role.startsWith("ADVISER") && user.collegeId
                  ? (
                      await db.college.findUnique({
                        where: { id: user.collegeId },
                        select: { name: true },
                      })
                    )?.name ?? ""
                  : "")
              }
              minWidth="56mm"
              ariaLabel="College"
            />
          </p>
          <p>
            Academic Rank:{" "}
            <Editable initial={primary?.adviser.positionTitle ?? ""} minWidth="42mm" ariaLabel="Academic rank" />
          </p>
          <p>
            Home Address: <Editable initial="" minWidth="46mm" ariaLabel="Home address" />
          </p>
          <p>
            Contact Number(s): <Editable initial="" minWidth="40mm" ariaLabel="Contact number(s)" />
          </p>
          <p>
            Date: <Editable initial="" minWidth="57mm" ariaLabel="Date" />
          </p>
        </div>

        <p className="mt-8 font-bold">Noted:</p>
        <div className="mt-6 font-bold">
          <SfSig
            name={dean ? `${dean.firstName} ${dean.lastName}` : ""}
            caption="Dean/Assoc. Dean of College"
            width="60mm"
            center={false}
            sig={deanSig}
            ariaLabel="Dean signature"
          />
        </div>

        <SfApprovers
          coordinatorSig={signed("SOA") ? approverSigs.coordinator : null}
          directorSig={signed("OSAS") ? approverSigs.director : null}
          spaced
        />
        <SfFooter code="LSPU-OSAS-SF-003" />
      </div>
    </>
  );
}
