// The client-defined organization-application requirements checklist. Derived
// from the data the schema actually stores — the SF-001 document checklist
// lives on the Recognition record (§5) — so the President, reviewers, and OSAS
// all read the same checklist and SUBMIT enforces the required items.
export type OrgAppRequirementKey = "SENIOR_ADVISER" | "PRESIDENT" | "SECRETARY" | "PROFILE";

export type OrgAppRequirementItem = {
  key: OrgAppRequirementKey;
  label: string;
  title: string;
  hint: string;
  met: boolean;
  enforced: boolean;
};

export type OrgAppRequirementsInput = {
  name: string | null;
  description: string | null;
  hasSeniorAdviser: boolean;
  hasPresident: boolean;
  hasSecretary: boolean;
};

export function orgAppRequirements(input: OrgAppRequirementsInput): OrgAppRequirementItem[] {
  return [
    {
      key: "SENIOR_ADVISER",
      label: "Senior Adviser",
      title: "Senior Adviser (Regular) assigned",
      hint: "A current Senior Adviser must be assigned before filing.",
      met: input.hasSeniorAdviser,
      enforced: true,
    },
    {
      key: "PRESIDENT",
      label: "President",
      title: "President seated for the current year",
      hint: "The application is filed by the organization's President or Secretary.",
      met: input.hasPresident,
      enforced: true,
    },
    {
      key: "SECRETARY",
      label: "Secretary",
      title: "Secretary seated for the current year",
      hint: "A Secretary of record for the current academic year is required.",
      met: input.hasSecretary,
      enforced: true,
    },
    {
      key: "PROFILE",
      label: "Profile",
      title: "Application profile completed",
      hint: "Provide the organization name, acronym, and a description.",
      met: Boolean(input.name && input.description),
      enforced: false,
    },
  ];
}

export function orgAppCompliancePct(items: OrgAppRequirementItem[]): number {
  if (items.length === 0) return 0;
  return Math.round((items.filter((i) => i.met).length / items.length) * 100);
}

export function orgAppSubmissionGaps(items: OrgAppRequirementItem[]): OrgAppRequirementItem[] {
  return items.filter((i) => i.enforced && !i.met);
}