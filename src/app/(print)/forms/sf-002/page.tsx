import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { currentAcademicYear } from "@/lib/utils";
import { canUseOrgForm } from "@/lib/forms-access";
import { Editable, PrintToolbar } from "@/components/forms/editable";
import { SfApprovers, SfDateBlank, SfFooter, SfLetterhead, SfSig } from "@/components/forms/sf-chrome";
import { FormOrgPicker } from "@/components/forms/org-picker";
import { SignatureRouteSection } from "@/components/forms/signature-route-section";
import { getApproversSignatures, getSignaturesFor } from "@/lib/signatures";

export const metadata: Metadata = { title: "SF-002 · Organization Renewal Form" };

/** SF-002 — exact replica of the renewal request letter. */
export default async function Sf002Page({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; ay?: string }>;
}) {
  const user = await requireUser();
  const { org: orgId, ay: ayParam } = await searchParams;
  const ay = /^\d{4}-\d{4}$/.test(ayParam ?? "") ? ayParam! : currentAcademicYear();
  if (!orgId) return <FormOrgPicker basePath="/forms/sf-002" />;

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
  const dean = org.college.dean;
  const [sigMap, approverSigs] = await Promise.all([
    getSignaturesFor([
      president?.id,
      ...org.advisers.map((a) => a.adviser.id),
      dean?.id,
    ]),
    getApproversSignatures(),
  ]);
  const orgDisplay = org.acronym ? `${org.name} (${org.acronym})` : org.name;
  const [ayStart, ayEnd] = ay.split("-");

  return (
    <>
      <PrintToolbar backHref={`/organizations/${org.id}`} title="SF-002 Organization Renewal Form" />

      <div className="mx-auto mb-4 mt-2 max-w-[210mm] px-4 print:hidden">
        <SignatureRouteSection
          formKey="SF002"
          orgId={org.id}
          ay={ay}
          title={`SF-002 · ${orgDisplay}`}
        />
      </div>

      <div className="sf-sheet">
        <SfLetterhead />

        <h1 className="mt-5 text-center font-bold">ORGANIZATION RENEWAL FORM</h1>

        <SfDateBlank />

        <div className="mt-4">
          <p className="font-bold">THE DIRECTOR/CHAIRPERSON</p>
          <p className="font-bold">OFFICE OF STUDENT AFFAIRS AND SERVICES</p>
          <p className="font-bold">LSPU</p>
        </div>

        <p className="mt-4 indent-10 font-bold">Thru: The Coordinator, Student Organization Unit</p>

        <p className="mt-4">Sir/Madam:</p>

        <p className="mt-3 indent-10">
          The <Editable initial={orgDisplay} minWidth="55mm" center ariaLabel="Name of Organization" />{" "}
          wishes to seek renewal of its recognition to function as a duly recognized LSPU for
          Organization Year 20<Editable initial={ayStart.slice(2)} minWidth="7mm" center ariaLabel="AY start" />{" "}
          - 20<Editable initial={ayEnd.slice(2)} minWidth="7mm" center ariaLabel="AY end" />.
        </p>

        <p className="mt-3 indent-10">
          In this connection, we are respectfully requesting from your good office to grant us
          permission to operate in our institution, subject to the existing rules &amp; regulation of
          our University.
        </p>

        <p className="mt-3 indent-10">Thank you very much.</p>

        <p className="mt-5 ml-auto w-fit mr-[25mm]">Very respectfully yours,</p>
        <div className="ml-auto mr-[15mm] w-fit text-center">
          <SfSig
            name={president ? `${president.firstName} ${president.lastName}` : ""}
            caption="Organization President"
            width="55mm"
            sig={president ? sigMap.get(president.id) : null}
            ariaLabel="Organization President signature"
          />
        </div>
        <div className="ml-auto mr-[15mm] mt-5 w-fit text-center">
          <Editable initial={orgDisplay} minWidth="55mm" center ariaLabel="Name of Organization" />
          <p className="mt-0.5">Name of Organization</p>
        </div>

        <p className="mt-6 font-bold">NOTED:</p>
        <div className="mt-6 space-y-6">
          <div className="space-y-6">
            {org.advisers.length > 0 ? (
              org.advisers.map((a, i) => (
                <SfSig
                  key={i}
                  name={`${a.adviser.firstName}${a.adviser.middleName ? ` ${a.adviser.middleName}` : ""} ${a.adviser.lastName}`}
                  caption="Adviser/s Student Organization"
                  width="60mm"
                  center={false}
                  sig={sigMap.get(a.adviser.id)}
                  ariaLabel="Adviser signature"
                />
              ))
            ) : (
              <SfSig
                name=""
                caption="Adviser/s Student Organization"
                width="60mm"
                center={false}
                ariaLabel="Adviser signature"
              />
            )}
          </div>
          <SfSig
            name={dean ? `${dean.firstName} ${dean.lastName}` : ""}
            width="80mm"
            center={false}
            sig={dean ? sigMap.get(dean.id) : null}
            ariaLabel="Dean signature"
            caption={
              <>
                Dean/Assoc. Dean, College of{" "}
                <Editable initial={org.college.name} minWidth="35mm" ariaLabel="College" />
              </>
            }
          />
        </div>

        <SfApprovers
          coordinatorSig={approverSigs.coordinator}
          directorSig={approverSigs.director}
        />
        <SfFooter code="LSPU-OSAS-SF-002" />
      </div>
    </>
  );
}
