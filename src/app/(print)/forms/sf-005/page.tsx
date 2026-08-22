import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { currentAcademicYear } from "@/lib/utils";
import { canUseOrgForm } from "@/lib/forms-access";
import { Editable, PrintToolbar } from "@/components/forms/editable";
import {
  SfApprovers,
  SfFooter,
  SfLetterhead,
  SfSig,
  SignatureMark,
} from "@/components/forms/sf-chrome";
import { FormOrgPicker } from "@/components/forms/org-picker";
import { getApproversSignatures, getSignaturesFor } from "@/lib/signatures";

export const metadata: Metadata = { title: "SF-005 · List of Members of the Organization" };

/**
 * SF-005 — exact replica of the official member roster: empty 1×1 picture
 * boxes with signature-over-printed-name, student number and course/year/
 * section lines. Boxes are left blank on purpose, matching the paper form
 * that members paste their photos onto. Officers-only (contains personal data).
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
  const [sigMap, approverSigs] = await Promise.all([
    getSignaturesFor([...memberIds, ...org.advisers.map((a) => a.adviser.id), dean?.id]),
    getApproversSignatures(),
  ]);

  return (
    <>
      <PrintToolbar backHref={`/organizations/${org.id}`} title="SF-005 List of Members" />

      <div className="sf-sheet-flow">
        <SfLetterhead />

        <h1 className="mt-5 text-center font-bold">LIST OF MEMBERS OF THE ORGANIZATION</h1>

        <p className="mt-3 text-center font-bold">
          <Editable initial="" minWidth="8mm" center ariaLabel="Semester number" /> Sem. / AY 20
          <Editable initial={ayStart.slice(2)} minWidth="7mm" center ariaLabel="AY start" /> - 20
          <Editable initial={ayEnd.slice(2)} minWidth="7mm" center ariaLabel="AY end" />
        </p>

        <p className="mt-2">
          Name of Organization{" "}
          <Editable initial={orgDisplay} minWidth="80mm" ariaLabel="Name of Organization" />
        </p>

        {/* Sample-format label from the official form, then one card per member */}
        <p className="mt-4 font-bold">SAMPLE FORMAT:</p>
        <div className="mt-2 grid grid-cols-4 gap-x-3 gap-y-5">
          {org.members.map((m, i) => (
            <div key={i} className="text-center">
              <div className="mx-auto flex h-[24mm] w-[28mm] items-center justify-center border border-black text-center text-[9pt] leading-tight text-black">
                1 x 1
                <br />
                PICTURE
              </div>
              <div className="mt-1">
                {sigMap.get(m.user.id) && <SignatureMark sig={sigMap.get(m.user.id)!} />}
                <Editable
                  initial={`${m.user.firstName}${m.user.middleName ? ` ${m.user.middleName}` : ""} ${m.user.lastName}`}
                  block
                  center
                  minWidth="38mm"
                  ariaLabel={`Signature over printed name ${i + 1}`}
                />
                <p className="text-[9pt]">(Signature Over Printed Name)</p>
              </div>
              <div className="mt-0.5">
                <Editable initial={m.user.studentNumber ?? ""} block center minWidth="38mm" ariaLabel={`Student number ${i + 1}`} />
                <p className="text-[9pt]">(Student Number)</p>
              </div>
              <div className="mt-0.5">
                <Editable initial={m.user.department?.name ?? ""} block center minWidth="38mm" ariaLabel={`Course/year/section ${i + 1}`} />
                <p className="text-[9pt]">(Course / Year Section)</p>
              </div>
            </div>
          ))}
          {org.members.length === 0 && (
            <div className="col-span-4 border border-dashed border-line-strong p-4 text-center text-content-secondary">
              No members on record for AY {ay}.
            </div>
          )}
        </div>

        {/* Adviser columns */}
        <div className="mt-10 flex justify-around gap-8">
          {[0, 1].map((i) => (
            <SfSig
              key={i}
              name={org.advisers[i] ? `${org.advisers[i].adviser.firstName} ${org.advisers[i].adviser.lastName}` : ""}
              width="55mm"
              sig={org.advisers[i] ? sigMap.get(org.advisers[i].adviser.id) : null}
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
            sig={dean ? sigMap.get(dean.id) : null}
            ariaLabel="Dean signature"
          />
        </div>

        <SfApprovers
          coordinatorSig={approverSigs.coordinator}
          directorSig={approverSigs.director}
          spaced
        />
        <SfFooter code="LSPU-OSAS-SF-005" />
      </div>
    </>
  );
}
