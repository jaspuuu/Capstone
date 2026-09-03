import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { currentAcademicYear } from "@/lib/utils";
import { canUseOrgForm } from "@/lib/forms-access";
import { Editable, PrintToolbar } from "@/components/forms/editable";
import { PhotoBox } from "@/components/forms/photo-box";
import {
  SfApprovers,
  SfFooter,
  SfLetterhead,
  SfSig,
  SignatureMark,
} from "@/components/forms/sf-chrome";
import { FormOrgPicker } from "@/components/forms/org-picker";
import { SignatureRouteSection } from "@/components/forms/signature-route-section";
import { getApproversSignatures, getSignaturesFor, type SignatureInfo } from "@/lib/signatures";
import { getSignedRolesForSf } from "@/lib/signature-routing";
export const instant = false;

export const metadata: Metadata = { title: "SF-005 · List of Members of the Organization" };

type SlotMember = {
  user: {
    id: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    studentNumber: string | null;
    department: { name: string } | null;
  };
};

/** One roster slot: picture box left, three ruled lines right with their
 * field hints printed on the lines themselves (type over them). */
function Slot({
  member,
  index = 0,
  sigMap,
}: {
  member?: SlotMember;
  index?: number;
  sigMap: Map<string, SignatureInfo>;
}) {
  const n = index;
  const hints = ["(Signature Over Printed Name)", "(Student Number)", "(Course / Year Section)"];
  return (
    <div className="flex w-fit items-center">
      <PhotoBox label={`1×1 picture ${n}`} />
      <div className="sf-slot-lines ml-[1.6mm] flex flex-col justify-center gap-0">
        {[0, 1, 2].map((row) => {
          const value = row === 0
            ? member ? `${member.user.firstName}${member.user.middleName ? ` ${member.user.middleName}` : ""} ${member.user.lastName}` : hints[0]
            : row === 1
              ? member?.user.studentNumber || hints[1]
              : member?.user.department?.name || hints[2];
          return (
            <div key={row}>
              {row === 0 && member && sigMap.get(member.user.id) && <SignatureMark sig={sigMap.get(member.user.id)!} />}
              <Editable
                initial={value}
                block
                minWidth="56.4mm"
                className={`w-[56.4mm] ${value.startsWith("(") ? "text-[9pt]" : ""}`}
                ariaLabel={`${["Name line", "Student number", "Course/year/section"][row]} ${n}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * SF-005 — pixel-faithful replica of the official DOCX (007-LIST-OF-MEMBERS):
 * one example slot under "SAMPLE FORMAT:" with field captions above its ruled
 * lines, then 4 rows × 2 columns of member slots — 1×1 picture box on the
 * left, three 56.4mm ruled lines beside it (name / student no. / course-yr).
 * The grid deliberately overflows the text margins like the original.
 */
export default async function Sf005Page({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; ay?: string }>;
}) {
  const user = await requireUser();
  const { org: orgId, ay: ayParam } = await searchParams;
  const ay = /^\d{4}-\d{4}$/.test(ayParam ?? "") ? ayParam! : currentAcademicYear();
  if (!orgId) return <FormOrgPicker basePath="/forms/sf-005" />;

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      acronym: true,
      collegeId: true,
      college: { select: { name: true, dean: { select: { id: true, firstName: true, lastName: true } } } },
      members: {
        where: { isCurrent: true, academicYear: ay },
        orderBy: [{ position: "asc" }, { user: { lastName: "asc" } }],
        select: {
          user: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              studentNumber: true,
              department: { select: { name: true } },
            },
          },
        },
      },
      advisers: {
        where: { isCurrent: true, academicYear: ay },
        select: { adviser: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!org) notFound();
  if (!(await canUseOrgForm(user, org, { officersOnly: true }))) notFound();

  const dean = org.college.dean;
  const orgDisplay = org.acronym ? `${org.name} (${org.acronym})` : org.name;
  const [ayStart, ayEnd] = ay.split("-");
  const memberIds = org.members.map((m) => m.user.id);
  const [sigMap, approverSigs, signedRoles] = await Promise.all([
    getSignaturesFor([...memberIds, ...org.advisers.map((a) => a.adviser.id), dean?.id]),
    getApproversSignatures(),
    getSignedRolesForSf("SF005", org.id, ay),
  ]);
  const signed = (role: string) => signedRoles.has(role);

  return (
    <>
      <PrintToolbar backHref={`/organizations/${org.id}`} title="SF-005 List of Members" />

      <div className="mx-auto mb-4 mt-2 max-w-[210mm] px-4 print:hidden">
        <SignatureRouteSection formKey="SF005" orgId={org.id} ay={ay} />
      </div>

      <div className="sf-sheet-flow relative">
        <SfLetterhead />

        <h1 className="mt-4 text-center text-[12pt] font-bold">LIST OF MEMBERS OF THE ORGANIZATION</h1>

        <p className="mt-2 text-center font-bold">
          <Editable initial="" minWidth="8mm" center ariaLabel="Semester number" /> Sem. / AY 20
          <Editable initial={ayStart.slice(2)} minWidth="7mm" center ariaLabel="AY start" /> - 20
          <Editable initial={ayEnd.slice(2)} minWidth="7mm" center ariaLabel="AY end" />
        </p>

        <p className="mt-2">
          Name of Organization{" "}
          <Editable initial={orgDisplay} minWidth="80mm" ariaLabel="Name of Organization" />
        </p>

        <p className="mt-3 text-center text-[11pt]">SAMPLE FORMAT:</p>

        {/* Example slot: the field hints are printed on its ruled lines */}
        <div className="mt-1 ml-[26mm]">
          <Slot sigMap={sigMap} />
        </div>

        {/* Member roster — 4 rows × 2 columns; grid spans wider than the text margins */}
        <div className="-ml-[13mm] mt-[2mm] grid w-[182mm] grid-cols-2 gap-x-[10mm] gap-y-[1.2mm]">
          {Array.from({ length: Math.max(8, Math.ceil(org.members.length / 2) * 2) }, (_, i) => (
            <Slot key={i} index={i + 1} member={org.members[i]} sigMap={sigMap} />
          ))}
        </div>

        {/* Adviser columns */}
        <div className="mt-10 flex justify-around gap-8">
          {[0, 1].map((i) => (
            <SfSig
              key={i}
              name={org.advisers[i] ? `${org.advisers[i].adviser.firstName} ${org.advisers[i].adviser.lastName}` : ""}
              width="55mm"
              sig={org.advisers[i] && signed("SENIOR_ADVISER") ? sigMap.get(org.advisers[i].adviser.id) : null}
              ariaLabel={`Adviser signature ${i + 1}`}
              caption={
                <>
                  Organization Adviser
                  <span className="mt-3 block">
                    Date: <Editable initial="" minWidth="35mm" ariaLabel={`Adviser date ${i + 1}`} />
                  </span>
                </>
              }
            />
          ))}
        </div>

        <p className="mt-8 font-bold">Noted:</p>
        <div className="mt-6">
          <SfSig
            name={dean ? `${dean.firstName} ${dean.lastName}` : ""}
            caption="Dean/Assoc. Dean of College"
            width="60mm"
            center={false}
            sig={dean && signed("DEAN") ? sigMap.get(dean.id) : null}
            ariaLabel="Dean signature"
          />
        </div>

        <SfApprovers
          coordinatorSig={signed("SOA") ? approverSigs.coordinator : null}
          directorSig={signed("OSAS") ? approverSigs.director : null}
          spaced
        />
        <SfFooter code="LSPU-OSAS-SF-005" />
      </div>
    </>
  );
}
