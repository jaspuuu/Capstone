import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { canUseOrgForm } from "@/lib/forms-access";
import { currentAcademicYear } from "@/lib/utils";
import { Editable, PrintToolbar } from "@/components/forms/editable";
import {
  SfDateBlank,
  SfFooter,
  SfLetterhead,
  SfSig,
  SignatureMark,
} from "@/components/forms/sf-chrome";
import { FormOrgPicker } from "@/components/forms/org-picker";
import { getApproversSignatures, getSignaturesFor } from "@/lib/signatures";
import { getSignedRolesForSf } from "@/lib/signature-routing";
export const instant = false;

export const metadata: Metadata = { title: "SF-006 · Certification" };

/**
 * SF-006 — exact replica of the dean's certification of bonafide membership.
 * Organization and college prefill; student details stay as editable blanks
 * (optionally prefilled via ?member=<userId>).
 */
export default async function Sf006Page({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; member?: string }>;
}) {
  const user = await requireUser();
  const { org: orgId, member: memberId } = await searchParams;
  if (!orgId) return <FormOrgPicker basePath="/forms/sf-006" />;

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      acronym: true,
      collegeId: true,
      college: {
        select: {
          name: true,
          dean: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      advisers: {
        where: { isCurrent: true },
        select: {
          adviser: { select: { id: true, firstName: true, lastName: true, middleName: true } },
        },
      },
      members: {
        where: { isCurrent: true },
        select: {
          userId: true,
          position: true,
          user: {
            select: {
              firstName: true,
              middleName: true,
              lastName: true,
              department: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!org) notFound();
  if (!(await canUseOrgForm(user, org))) notFound();

  const member = memberId ? org.members.find((m) => m.userId === memberId) : undefined;
  const mu = member?.user;
  const positionLabel =
    member?.position === "PRESIDENT" ? "President" : member?.position === "SECRETARY" ? "Secretary" : "";
  const dean = org.college.dean;
  const orgDisplay = org.acronym ? `${org.name} (${org.acronym})` : org.name;
  const [sigMap, approverSigs, signedRoles] = await Promise.all([
    getSignaturesFor([...org.advisers.map((a) => a.adviser.id), dean?.id]),
    getApproversSignatures(),
    getSignedRolesForSf("SF006", org.id, currentAcademicYear()),
  ]);
  const signed = (role: string) => signedRoles.has(role);

  return (
    <>
      <PrintToolbar backHref={`/organizations/${org.id}`} title="SF-006 Certification" />

      <div className="sf-sheet">
        <SfLetterhead />

        <h1 className="mt-8 text-center font-bold tracking-wide">CERTIFICATION</h1>

        <SfDateBlank />

        <p className="mt-10 indent-12">
          This certifies that{" "}
          <Editable initial={mu ? `${mu.lastName}, ${mu.firstName}${mu.middleName ? ` ${mu.middleName.charAt(0)}.` : ""}` : ""} minWidth="70mm" center ariaLabel="Student name (last, first, middle initial)" />
          , a student taking up{" "}
          <Editable initial={mu?.department?.name ?? ""} minWidth="45mm" center ariaLabel="Course, year and section" />{" "}
          from the College of{" "}
          <Editable initial={org.college.name} minWidth="40mm" center ariaLabel="College" /> is a
          bonafide LSPU Student, not under academic probation, not under disciplinary probation, and
          the elected/appointed{" "}
          <Editable initial={positionLabel} minWidth="30mm" center ariaLabel="Position/rank" /> of the{" "}
          <Editable initial={orgDisplay} minWidth="40mm" center ariaLabel="Organization" />.
        </p>

        <p className="mt-4 text-center text-[9pt]">(LAST NAME, FIRST NAME, MIDDLE INITIAL)</p>
        <p className="text-center text-[9pt]">(course, year and section)</p>
        <p className="mt-1 text-[9pt]">
          <span className="ml-[55mm]">(position/rank)</span>
          <span className="ml-[35mm]">(organization)</span>
        </p>

        <p className="mt-10">Certified true and correct:</p>

        <div className="mt-10 space-y-10">
          {org.advisers.length > 0 ? (
            org.advisers.map((a, i) => (
              <SfSig
                key={i}
                name={`${a.adviser.firstName}${a.adviser.middleName ? ` ${a.adviser.middleName}` : ""} ${a.adviser.lastName}`}
                caption="Organization Adviser(s)"
                width="60mm"
                center={false}
                sig={signed("SENIOR_ADVISER") ? sigMap.get(a.adviser.id) : null}
                ariaLabel={`Adviser signature ${i + 1}`}
              />
            ))
          ) : (
            <SfSig
              name=""
              caption="Organization Adviser(s)"
              width="60mm"
              center={false}
              ariaLabel="Adviser signature"
            />
          )}

          <SfSig
            name={dean ? `${dean.firstName} ${dean.lastName}` : ""}
            caption="Dean/Assoc. Dean of College"
            width="60mm"
            center={false}
            sig={dean && signed("DEAN") ? sigMap.get(dean.id) : null}
            ariaLabel="Dean signature"
          />
        </div>

        <p className="mt-10 font-bold">Noted:</p>

        <div className="mt-16 text-center">
          {signed("OSAS") && approverSigs.director && (
            <div className="mb-1">
              <SignatureMark sig={approverSigs.director} />
            </div>
          )}
          <p className="font-bold underline">ALBERTO B. CASTILLO, EdD</p>
          <p>Director/Chairperson, Office of Student Affairs and Services</p>
        </div>

        <SfFooter code="LSPU-OSAS-SF-006" />
      </div>
    </>
  );
}
