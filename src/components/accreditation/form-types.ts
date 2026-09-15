export type PreviewData = Record<string, any>;

export interface FormField {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "date" | "number";
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: any;
  hint?: string;
  rows?: number;
  autoPopulate?: (org: any, user: any, recognition: any) => any;
}

export interface SignatureSlot {
  role: string;
  order: number;
  required: boolean;
  conditionalOn?: string | null;
  description?: string | null;
}

export interface FormTemplate {
  key: string;
  title: string;
  description: string;
  fields: FormField[];
  signatureSlots?: SignatureSlot[];
}

export type FormPreviewContext = {
  orgName: string;
  orgAcronym: string;
  academicYear: string;
  collegeName?: string | null;
};
