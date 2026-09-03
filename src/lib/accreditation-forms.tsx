import type { FormTemplate, FormField } from "@/components/accreditation/form-editor";
import { fullName } from "@/lib/utils";

type PreviewData = Record<string, any>;

export function getApplicationLetterTemplate(org: any, recognition: any, user: any): FormTemplate {
  const president = org.members?.find((m: any) => m.position === "PRESIDENT")?.user;
  const adviser = org.advisers?.find((a: any) => a.type === "REGULAR")?.adviser;

  return {
    key: "APPLICATION_LETTER",
    title: "Application/Renewal Letter",
    description: "Official letter requesting recognition or renewal",
    signatureSlots: [
      { role: "PRESIDENT", order: 1, required: true, conditionalOn: null },
      { role: "SECRETARY", order: 2, required: true, conditionalOn: null },
      { role: "SENIOR_ADVISER", order: 3, required: true, conditionalOn: null },
      { role: "DEAN", order: 4, required: true, conditionalOn: null },
    ],
    fields: [
      {
        name: "date",
        label: "Date",
        type: "date",
        required: true,
        defaultValue: new Date().toISOString().split("T")[0],
      },
      {
        name: "organizationName",
        label: "Organization Name",
        type: "text",
        required: true,
        defaultValue: org.name,
      },
      {
        name: "organizationAcronym",
        label: "Acronym",
        type: "text",
        defaultValue: org.acronym,
      },
      {
        name: "college",
        label: "College",
        type: "text",
        required: true,
        defaultValue: org.college?.name,
      },
      {
        name: "applicationType",
        label: "Application Type",
        type: "select",
        required: true,
        options: [
          { value: "INITIAL", label: "Initial Recognition" },
          { value: "RENEWAL", label: "Renewal of Recognition" },
        ],
        defaultValue: recognition.kind,
      },
      {
        name: "academicYear",
        label: "Academic Year",
        type: "text",
        required: true,
        defaultValue: recognition.academicYear,
        hint: "Format: 2026-2027",
      },
      {
        name: "presidentName",
        label: "President Name",
        type: "text",
        required: true,
        defaultValue: president ? fullName(president) : "",
      },
      {
        name: "presidentStudentNumber",
        label: "President Student Number",
        type: "text",
        defaultValue: president?.studentNumber ?? "",
      },
      {
        name: "adviserName",
        label: "Adviser Name",
        type: "text",
        required: true,
        defaultValue: adviser ? fullName(adviser) : "",
      },
      {
        name: "adviserType",
        label: "Adviser Type",
        type: "select",
        options: [
          { value: "REGULAR", label: "Regular Faculty Adviser" },
          { value: "PART_TIME", label: "Part-Time Faculty Adviser" },
        ],
        defaultValue: adviser?.role === "ADVISER_REGULAR" ? "REGULAR" : "PART_TIME",
      },
      {
        name: "purpose",
        label: "Purpose Statement",
        type: "textarea",
        required: true,
        defaultValue: `We, the officers and members of ${org.name} (${org.acronym}), respectfully request ${recognition.kind === "RENEWAL" ? "renewal of" : "initial"} recognition for Academic Year ${recognition.academicYear}. Our organization is committed to...`,
        rows: 6,
      },
      {
        name: "requirementsList",
        label: "Requirements Submitted",
        type: "textarea",
        required: true,
        defaultValue: `1. Constitution and By-Laws
2. Plan of Activities for One Year
${recognition.kind === "RENEWAL" ? "3. Accomplishment Reports" : "3. Adviser Commitment Form"}
4. Adviser Commitment Form
5. Dean/Associate Dean Certification
6. Financial Report (if applicable)`,
        rows: 8,
      },
      {
        name: "closingRemarks",
        label: "Closing Remarks",
        type: "textarea",
        defaultValue: "We hope for your favorable action on this request. Thank you.",
        rows: 3,
      },
    ],
    previewTemplate: (data: PreviewData) => (
      <div className="font-serif leading-relaxed" style={{ fontSize: "12pt" }}>
        <div className="text-center mb-8 space-y-2">
          <p className="text-sm font-bold uppercase tracking-wider">Republic of the Philippines</p>
          <p className="text-sm font-bold">Laguna State Polytechnic University</p>
          <p className="text-sm">Office of Student Affairs and Services</p>
          <hr className="border-t border-black mx-auto w-1/2" />
          <p className="text-lg font-bold underline mt-4">{data.applicationType === "RENEWAL" ? "Application for Renewal of Recognition" : "Application for Recognition"}</p>
        </div>

        <p className="text-right mb-6"><strong>Date:</strong> {data.date}</p>

        <div className="mb-6 space-y-1">
          <p><strong>To:</strong> The OSAS Director/Chairperson</p>
          <p><strong>Through:</strong> Channels</p>
        </div>

        <p className="text-justify mb-4 text-indent-8">
          {data.purpose}
        </p>

        <div className="mb-6">
          <p className="font-bold mb-2">Organization Details:</p>
          <table className="w-full border-collapse text-sm mb-4">
            <tbody>
              <tr><td className="w-1/3">Organization Name:</td><td className="border-b border-gray-300 pl-2">{data.organizationName}</td></tr>
              <tr><td>Acronym:</td><td className="border-b border-gray-300 pl-2">{data.organizationAcronym}</td></tr>
              <tr><td>College:</td><td className="border-b border-gray-300 pl-2">{data.college}</td></tr>
              <tr><td>Application Type:</td><td className="border-b border-gray-300 pl-2">{data.applicationType === "RENEWAL" ? "Renewal" : "Initial"}</td></tr>
              <tr><td>Academic Year:</td><td className="border-b border-gray-300 pl-2">{data.academicYear}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="mb-6">
          <p className="font-bold mb-2">Officers:</p>
          <table className="w-full border-collapse text-sm mb-4">
            <tbody>
              <tr><td className="w-1/3">President:</td><td className="border-b border-gray-300 pl-2">{data.presidentName}</td></tr>
              <tr><td>Student Number:</td><td className="border-b border-gray-300 pl-2">{data.presidentStudentNumber}</td></tr>
              <tr><td>Adviser:</td><td className="border-b border-gray-300 pl-2">{data.adviserName} ({data.adviserType === "REGULAR" ? "Regular" : "Part-Time"})</td></tr>
            </tbody>
          </table>
        </div>

        <div className="mb-6">
          <p className="font-bold mb-2">Requirements Submitted:</p>
          <pre className="text-sm whitespace-pre-wrap border border-gray-300 p-3 bg-gray-50 rounded">{data.requirementsList}</pre>
        </div>

        <p className="text-justify mb-8">{data.closingRemarks}</p>

        <div className="grid grid-cols-2 gap-8 mt-12">
          <div className="text-center">
            <p className="border-t border-black w-full mb-1"></p>
            <p className="text-sm font-bold">{data.presidentName}</p>
            <p className="text-xs">President</p>
          </div>
          <div className="text-center">
            <p className="border-t border-black w-full mb-1"></p>
            <p className="text-sm font-bold">{data.adviserName}</p>
            <p className="text-xs">Adviser</p>
          </div>
        </div>
      </div>
    ),
  };
}

export function getConstitutionTemplate(org: any, recognition: any): FormTemplate {
  return {
    key: "CONSTITUTION",
    title: "Constitution and By-Laws",
    description: "Organization's governing document",
    signatureSlots: [
      { role: "PRESIDENT", order: 1, required: true, conditionalOn: null },
      { role: "DEAN", order: 2, required: true, conditionalOn: null },
    ],
    fields: [
      { name: "documentTitle", label: "Document Title", type: "text", required: true, defaultValue: `Constitution and By-Laws of ${org.name}` },
      { name: "article1", label: "Article I - Name and Purpose", type: "textarea", required: true, rows: 6, defaultValue: `Section 1. The name of this organization shall be ${org.name} (${org.acronym}).\nSection 2. The purpose of this organization is to...` },
      { name: "article2", label: "Article II - Membership", type: "textarea", required: true, rows: 6 },
      { name: "article3", label: "Article III - Officers", type: "textarea", required: true, rows: 6 },
      { name: "article4", label: "Article IV - Meetings", type: "textarea", required: true, rows: 4 },
      { name: "article5", label: "Article V - Amendments", type: "textarea", required: true, rows: 4 },
      { name: "approvedBy", label: "Approved By", type: "text", defaultValue: "" },
      { name: "approvalDate", label: "Approval Date", type: "date" },
    ],
    previewTemplate: (data: PreviewData) => (
      <div className="font-serif leading-relaxed" style={{ fontSize: "12pt" }}>
        <div className="text-center mb-8">
          <p className="text-2xl font-bold underline">{data.documentTitle}</p>
          <p className="text-sm text-gray-600">Academic Year: {recognition.academicYear}</p>
        </div>
        <div className="space-y-6">
          {["article1", "article2", "article3", "article4", "article5"].map((key) => (
            data[key] && (
              <div key={key} className="border-t border-gray-300 pt-4">
                <h3 className="font-bold text-lg mb-2">{key.replace("article", "Article ").toUpperCase()}</h3>
                <pre className="whitespace-pre-wrap text-sm">{data[key]}</pre>
              </div>
            )
          ))}
        </div>
        {data.approvedBy && (
          <div className="mt-12 grid grid-cols-2 gap-8">
            <div className="text-center border-t border-black"></div>
            <div className="text-center border-t border-black">
              <p className="text-sm font-bold">{data.approvedBy}</p>
              <p className="text-xs">Date: {data.approvalDate}</p>
            </div>
          </div>
        )}
      </div>
    ),
  };
}

export function getPlanOfActivitiesTemplate(org: any, recognition: any): FormTemplate {
  return {
    key: "PLAN_OF_ACTIVITIES",
    title: "Plan of Activities (One Year)",
    description: "Annual program of activities for the organization",
    signatureSlots: [
      { role: "PRESIDENT", order: 1, required: true, conditionalOn: null },
      { role: "SENIOR_ADVISER", order: 2, required: true, conditionalOn: null },
      { role: "DEAN", order: 3, required: true, conditionalOn: null },
    ],
    fields: [
      { name: "semester", label: "Semester", type: "select", required: true, options: [{ value: "1st", label: "1st Semester (Jun–Dec)" }, { value: "2nd", label: "2nd Semester (Jan–May)" }], defaultValue: "1st" },
      { name: "activities", label: "Planned Activities", type: "textarea", required: true, rows: 12, defaultValue: `Month | Activity Title | Description | Estimated Budget | Expected Participants
June | General Assembly | Orientation and election of officers | 5,000 | 50
July | Team Building | Leadership training | 15,000 | 30
...` },
      { name: "preparedBy", label: "Prepared By", type: "text", required: true, defaultValue: "" },
      { name: "approvedBy", label: "Approved By", type: "text" },
    ],
    previewTemplate: (data: PreviewData) => (
      <div className="font-serif leading-relaxed" style={{ fontSize: "11pt" }}>
        <div className="text-center mb-6">
          <p className="text-xl font-bold underline">Plan of Activities for AY {recognition.academicYear}</p>
          <p className="font-bold">{org.name} ({org.acronym})</p>
          <p>Semester: {data.semester}</p>
        </div>
        <pre className="whitespace-pre-wrap text-sm font-mono border border-gray-300 p-4 bg-gray-50 rounded">{data.activities}</pre>
        <div className="mt-8 grid grid-cols-2 gap-8">
          <div className="text-center border-t border-black"><p className="text-sm font-bold">{data.preparedBy}</p><p className="text-xs">Prepared By</p></div>
          <div className="text-center border-t border-black"><p className="text-sm font-bold">{data.approvedBy}</p><p className="text-xs">Approved By</p></div>
        </div>
      </div>
    ),
  };
}

export function getAccomplishmentReportsTemplate(org: any, recognition: any): FormTemplate {
  return {
    key: "ACCOMPLISHMENT_REPORTS",
    title: "Accomplishment Reports",
    description: "Reports of completed activities (required for renewal)",
    signatureSlots: [
      { role: "PRESIDENT", order: 1, required: true, conditionalOn: null },
      { role: "SENIOR_ADVISER", order: 2, required: true, conditionalOn: null },
    ],
    fields: [
      { name: "reportTitle", label: "Report Title", type: "text", required: true, defaultValue: `Accomplishment Report - AY ${recognition.academicYear}` },
      { name: "activitiesSummary", label: "Summary of Completed Activities", type: "textarea", required: true, rows: 10, defaultValue: `Activity | Date Conducted | Participants | Budget Used | Status
General Assembly | June 15, 2026 | 45 | 4,500 | Completed
Team Building | July 20, 2026 | 28 | 14,000 | Completed
...` },
      { name: "preparedBy", label: "Prepared By", type: "text", required: true },
      { name: "notedBy", label: "Noted By (Adviser)", type: "text" },
    ],
    previewTemplate: (data: PreviewData) => (
      <div className="font-serif leading-relaxed" style={{ fontSize: "11pt" }}>
        <div className="text-center mb-6">
          <p className="text-xl font-bold underline">{data.reportTitle}</p>
          <p className="font-bold">{org.name} ({org.acronym})</p>
          <p>Academic Year: {recognition.academicYear}</p>
        </div>
        <pre className="whitespace-pre-wrap text-sm font-mono border border-gray-300 p-4 bg-gray-50 rounded">{data.activitiesSummary}</pre>
        <div className="mt-8 grid grid-cols-2 gap-8">
          <div className="text-center border-t border-black"><p className="text-sm font-bold">{data.preparedBy}</p><p className="text-xs">Prepared By</p></div>
          <div className="text-center border-t border-black"><p className="text-sm font-bold">{data.notedBy}</p><p className="text-xs">Noted By (Adviser)</p></div>
        </div>
      </div>
    ),
  };
}

export function getAdviserCommitmentTemplate(org: any, recognition: any): FormTemplate {
  return {
    key: "ADVISER_COMMITMENT",
    title: "Adviser Commitment Form",
    description: "Faculty adviser's commitment to the organization",
    signatureSlots: [
      { role: "PRESIDENT", order: 1, required: true, conditionalOn: null },
      { role: "ADVISER", order: 2, required: true, conditionalOn: null },
      { role: "DEAN", order: 3, required: true, conditionalOn: null },
    ],
    fields: [
      { name: "adviserName", label: "Adviser Name", type: "text", required: true, defaultValue: "" },
      { name: "adviserRole", label: "Role", type: "select", required: true, options: [{ value: "REGULAR", label: "Regular Faculty Adviser" }, { value: "PART_TIME", label: "Part-Time Faculty Adviser" }], defaultValue: "REGULAR" },
      { name: "commitmentStatement", label: "Commitment Statement", type: "textarea", required: true, rows: 6, defaultValue: `I, [Adviser Name], hereby commit to serve as the ${recognition.kind === "RENEWAL" ? "continuing" : ""} adviser of ${org.name} for Academic Year ${recognition.academicYear}. I understand my responsibilities include...` },
      { name: "termStart", label: "Term Start", type: "date", required: true },
      { name: "termEnd", label: "Term End", type: "date", required: true },
      { name: "adviserSignature", label: "Adviser Signature", type: "checkbox", required: true, defaultValue: false },
    ],
    previewTemplate: (data: PreviewData) => (
      <div className="font-serif leading-relaxed" style={{ fontSize: "12pt" }}>
        <div className="text-center mb-8">
          <p className="text-xl font-bold underline">Adviser Commitment Form</p>
          <p className="font-bold">{org.name} ({org.acronym})</p>
          <p>Academic Year: {recognition.academicYear}</p>
        </div>
        <p className="text-justify mb-6">{data.commitmentStatement}</p>
        <div className="mb-6 space-y-2">
          <p><strong>Adviser:</strong> {data.adviserName} ({data.adviserRole === "REGULAR" ? "Regular" : "Part-Time"})</p>
          <p><strong>Term:</strong> {data.termStart} to {data.termEnd}</p>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-8">
          <div className="text-center border-t border-black"><p className="text-sm font-bold">{data.adviserName}</p><p className="text-xs">Adviser Signature</p></div>
          <div className="text-center border-t border-black"><p className="text-sm font-bold">Date: {data.termStart}</p></div>
        </div>
      </div>
    ),
  };
}

export function getCertificationTemplate(org: any, recognition: any): FormTemplate {
  return {
    key: "CERTIFICATION",
    title: "Dean/Associate Dean Certification",
    description: "College dean's certification of the organization",
    signatureSlots: [
      { role: "DEAN", order: 1, required: true, conditionalOn: null },
    ],
    fields: [
      { name: "deanName", label: "Dean Name", type: "text", required: true, defaultValue: "" },
      { name: "deanTitle", label: "Title", type: "select", required: true, options: [{ value: "Dean", label: "Dean" }, { value: "Associate Dean", label: "Associate Dean" }], defaultValue: "Dean" },
      { name: "college", label: "College", type: "text", required: true, defaultValue: org.college?.name },
      { name: "certificationStatement", label: "Certification Statement", type: "textarea", required: true, rows: 6, defaultValue: `This is to certify that ${org.name} (${org.acronym}) is a duly organized student organization under the ${org.college?.name}. The organization has complied with all college requirements...` },
      { name: "dateSigned", label: "Date Signed", type: "date", required: true },
    ],
    previewTemplate: (data: PreviewData) => (
      <div className="font-serif leading-relaxed" style={{ fontSize: "12pt" }}>
        <div className="text-center mb-8">
          <p className="text-xl font-bold underline">Certification</p>
          <p className="font-bold">{org.name} ({org.acronym})</p>
        </div>
        <p className="text-justify mb-6">{data.certificationStatement}</p>
        <div className="mb-6">
          <p><strong>College:</strong> {data.college}</p>
          <p><strong>Dean:</strong> {data.deanName}, {data.deanTitle}</p>
          <p><strong>Date:</strong> {data.dateSigned}</p>
        </div>
        <div className="mt-12 text-center border-t border-black w-1/2 mx-auto">
          <p className="text-sm font-bold mt-2">{data.deanName}</p>
          <p className="text-xs">{data.deanTitle}, {data.college}</p>
        </div>
      </div>
    ),
  };
}

export function getFinancialReportTemplate(org: any, recognition: any): FormTemplate {
  return {
    key: "FINANCIAL_REPORT",
    title: "Financial Report",
    description: "Organization's financial statement (if applicable)",
    signatureSlots: [
      { role: "PRESIDENT", order: 1, required: false, conditionalOn: null },
    ],
    fields: [
      { name: "reportPeriod", label: "Report Period", type: "text", required: true, defaultValue: `AY ${recognition.academicYear}` },
      { name: "beginningBalance", label: "Beginning Balance", type: "number", required: true, defaultValue: 0 },
      { name: "totalIncome", label: "Total Income", type: "number", required: true, defaultValue: 0 },
      { name: "totalExpenses", label: "Total Expenses", type: "number", required: true, defaultValue: 0 },
      { name: "endingBalance", label: "Ending Balance", type: "number", required: true, defaultValue: 0 },
      { name: "incomeBreakdown", label: "Income Breakdown", type: "textarea", rows: 6, defaultValue: `Source | Amount
Membership Fees | 10,000
Fundraising | 15,000
...` },
      { name: "expenseBreakdown", label: "Expense Breakdown", type: "textarea", rows: 6, defaultValue: `Activity | Amount
General Assembly | 4,500
Team Building | 14,000
...` },
      { name: "preparedBy", label: "Prepared By (Treasurer)", type: "text", required: true },
      { name: "auditedBy", label: "Audited By", type: "text" },
    ],
    previewTemplate: (data: PreviewData) => (
      <div className="font-serif leading-relaxed" style={{ fontSize: "11pt" }}>
        <div className="text-center mb-6">
          <p className="text-xl font-bold underline">Financial Report</p>
          <p className="font-bold">{org.name} ({org.acronym})</p>
          <p>{data.reportPeriod}</p>
        </div>
        <div className="mb-6 grid grid-cols-4 gap-4 text-center border border-gray-300 p-4">
          <div className="border-r border-gray-300"><p className="text-sm text-gray-600">Beginning Balance</p><p className="font-bold text-lg">₱{data.beginningBalance?.toLocaleString()}</p></div>
          <div className="border-r border-gray-300"><p className="text-sm text-gray-600">Total Income</p><p className="font-bold text-lg text-green-600">₱{data.totalIncome?.toLocaleString()}</p></div>
          <div className="border-r border-gray-300"><p className="text-sm text-gray-600">Total Expenses</p><p className="font-bold text-lg text-red-600">₱{data.totalExpenses?.toLocaleString()}</p></div>
          <div><p className="text-sm text-gray-600">Ending Balance</p><p className="font-bold text-lg">₱{data.endingBalance?.toLocaleString()}</p></div>
        </div>
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div><p className="font-bold mb-2">Income Breakdown</p><pre className="whitespace-pre-wrap text-sm border border-gray-300 p-3 bg-gray-50 rounded">{data.incomeBreakdown}</pre></div>
          <div><p className="font-bold mb-2">Expense Breakdown</p><pre className="whitespace-pre-wrap text-sm border border-gray-300 p-3 bg-gray-50 rounded">{data.expenseBreakdown}</pre></div>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-8">
          <div className="text-center border-t border-black"><p className="text-sm font-bold">{data.preparedBy}</p><p className="text-xs">Prepared By (Treasurer)</p></div>
          <div className="text-center border-t border-black"><p className="text-sm font-bold">{data.auditedBy}</p><p className="text-xs">Audited By</p></div>
          <div className="text-center border-t border-black"><p className="text-sm font-bold">{data.deanName || ""}</p><p className="text-xs">Dean/Associate Dean</p></div>
        </div>
      </div>
    ),
  };
}

export const FORM_TEMPLATES: Record<string, (org: any, recognition: any, user: any) => FormTemplate> = {
  APPLICATION_LETTER: getApplicationLetterTemplate,
  CONSTITUTION: getConstitutionTemplate,
  PLAN_OF_ACTIVITIES: getPlanOfActivitiesTemplate,
  ACCOMPLISHMENT_REPORTS: getAccomplishmentReportsTemplate,
  ADVISER_COMMITMENT: getAdviserCommitmentTemplate,
  CERTIFICATION: getCertificationTemplate,
  FINANCIAL_REPORT: getFinancialReportTemplate,
};

export function getTemplateForKey(key: string, org: any, recognition: any, user: any): FormTemplate {
  const factory = FORM_TEMPLATES[key];
  if (!factory) throw new Error(`No template for ${key}`);
  return factory(org, recognition, user);
}