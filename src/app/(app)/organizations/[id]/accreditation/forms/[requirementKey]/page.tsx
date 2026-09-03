import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { can, orgScopeWhere } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { currentAcademicYear, fullName } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { FormEditor } from "@/components/accreditation/form-editor";
import { getTemplateForKey } from "@/lib/accreditation-forms";
import { ATTACHMENT_KIND_LABELS } from "@/lib/attachments";

export const instant = false;

interface RouteParams {
  params: Promise<{ id: string; requirementKey: string }>;
}

export default async function FormPage({ params }: RouteParams) {
  const user = await requireUser();
  const { id, requirementKey } = await params;
  const ay = currentAcademicYear();

  // Verify organization access
  const org = await db.organization.findFirst({
    where: { AND: [orgScopeWhere(user), { id }] },
    select: {
      id: true,
      name: true,
      acronym: true,
      collegeId: true,
      college: { select: { name: true } },
      members: {
        where: { isCurrent: true, academicYear: ay },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true, studentNumber: true } } },
      },
      advisers: {
        where: { isCurrent: true, academicYear: ay },
        include: { adviser: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
      },
    },
  });
  if (!org) notFound();

  // Get current recognition
  const recognition = await db.recognition.findFirst({
    where: { organizationId: id, academicYear: ay },
    select: { id: true, kind: true, status: true, academicYear: true },
  });
  if (!recognition) notFound();

  // Check if user can edit this form
  const isOfficer =
    (user.role === "PRESIDENT" || user.role === "SECRETARY") &&
    org.members.some((m) => m.userId === user.id);
  const canEdit = isOfficer && ["DRAFT", "RETURNED"].includes(recognition.status);

  // Get existing form data from attachments
  const existingAttachment = await db.attachment.findFirst({
    where: {
      entityType: "Recognition",
      entityId: recognition.id,
      kind: requirementKey as any,
    },
    orderBy: { createdAt: "desc" },
  });

  // Build template
  const template = getTemplateForKey(requirementKey, org, recognition, user);

  // Pre-populate with existing data if available
  let initialData: Record<string, any> = {};
  if (existingAttachment) {
    // In a real implementation, you'd parse the stored document
    // For now, we'll use the template defaults
  }

  // Auto-populate common fields
  const president = org.members.find((m) => m.position === "PRESIDENT")?.user;
  const seniorAdviser = org.advisers.find((a) => a.type === "REGULAR")?.adviser;

  if (requirementKey === "APPLICATION_LETTER") {
    initialData = {
      organizationName: org.name,
      organizationAcronym: org.acronym,
      college: org.college?.name,
      applicationType: recognition.kind,
      academicYear: ay,
      presidentName: president ? fullName(president) : "",
      presidentStudentNumber: president?.studentNumber ?? "",
      adviserName: seniorAdviser ? fullName(seniorAdviser) : "",
      adviserType: seniorAdviser?.role === "ADVISER_REGULAR" ? "REGULAR" : "PART_TIME",
      date: new Date().toISOString().split("T")[0],
    };
  } else if (requirementKey === "CONSTITUTION") {
    initialData = {
      documentTitle: `Constitution and By-Laws of ${org.name}`,
    };
  } else if (requirementKey === "PLAN_OF_ACTIVITIES") {
    initialData = {
      semester: "1st",
    };
  } else if (requirementKey === "ACCOMPLISHMENT_REPORTS") {
    initialData = {
      reportTitle: `Accomplishment Report - AY ${ay}`,
    };
  } else if (requirementKey === "ADVISER_COMMITMENT") {
    initialData = {
      adviserName: seniorAdviser ? fullName(seniorAdviser) : "",
      adviserType: seniorAdviser?.role === "ADVISER_REGULAR" ? "REGULAR" : "PART_TIME",
      termStart: `${ay.split("-")[0]}-06-01`,
      termEnd: `${ay.split("-")[1]}-05-31`,
    };
  } else if (requirementKey === "CERTIFICATION") {
    initialData = {
      college: org.college?.name,
    };
  } else if (requirementKey === "FINANCIAL_REPORT") {
    initialData = {
      reportPeriod: `AY ${ay}`,
      beginningBalance: 0,
      totalIncome: 0,
      totalExpenses: 0,
      endingBalance: 0,
    };
  }

  const label = ATTACHMENT_KIND_LABELS[requirementKey as keyof typeof ATTACHMENT_KIND_LABELS] ?? requirementKey;

  return (
    <>
      <PageHeader
        title={label}
        description={`${template.description} · ${org.name} · AY ${ay}`}
        breadcrumb={[
          { label: "Organizations", href: "/organizations" },
          { label: org.acronym ?? org.name, href: `/organizations/${id}` },
          { label: "Accreditation", href: `/organizations/${id}/accreditation` },
          { label: label },
        ]}
        actions={
          <a
            href={`/organizations/${id}/accreditation`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-content-secondary hover:text-content"
          >
            Back to Accreditation
          </a>
        }
      />

      <div className="h-[calc(100vh-160px)] min-h-[600px]">
        <FormEditor
          template={template}
          initialData={initialData}
          organizationId={id}
          recognitionId={recognition.id}
          requirementKey={requirementKey}
          onSave={async (data) => {
            // Save draft - would call a server action
            console.log("Saving draft:", data);
          }}
          onSubmit={async (data) => {
            // Submit form - would call a server action
            console.log("Submitting:", data);
          }}
        />
      </div>
    </>
  );
}