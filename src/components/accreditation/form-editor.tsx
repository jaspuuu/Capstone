"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Download, Maximize2, Minimize2, FileText } from "lucide-react";
import { uploadAttachment } from "@/lib/actions/attachments";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/action-form";

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
  previewTemplate: (data: PreviewData) => React.ReactNode;
}

export interface FormEditorProps {
  template: FormTemplate;
  initialData?: Record<string, any>;
  organizationId: string;
  recognitionId: string;
  requirementKey: string;
  onSave?: (data: Record<string, any>) => Promise<void>;
  onSubmit?: (data: Record<string, any>) => Promise<void>;
}

export function FormEditor({
  template,
  initialData = {},
  organizationId,
  recognitionId,
  requirementKey,
  onSave,
  onSubmit,
}: FormEditorProps) {
  const [data, setData] = useState<Record<string, any>>(initialData);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    setData({ ...initialData });
  }, []);

  const handleChange = (name: string, value: any) => {
    setData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (onSave) await onSave(data);
  };

  const handleSubmit = async () => {
    if (onSubmit) await onSubmit(data);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("entityType", "Recognition");
    formData.append("entityId", recognitionId);
    formData.append("file", file);
    formData.append("kind", requirementKey as any);
    await uploadAttachment({} as any, formData);
  };

  return (
    <div className="h-[calc(100vh-200px)] min-h-[600px] flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b border-line bg-surface-secondary/50 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-content">{template.title}</h3>
          <span className="text-xs text-content-secondary">{template.description}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
            className="gap-1"
          >
            {showPreview ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            {showPreview ? "Hide Preview" : "Show Preview"}
          </Button>
          <ActionForm action={uploadAttachment} submitLabel="Upload Document" variant="outline">
            <input type="hidden" name="entityType" value="Recognition" />
            <input type="hidden" name="entityId" value={recognitionId} />
            <input type="hidden" name="kind" value={requirementKey} />
            <input
              type="file"
              name="file"
              onChange={handleFileUpload}
              accept=".pdf,.png,.jpg,.jpeg,.docx"
              className="sr-only"
            />
            <Button type="button" variant="outline">
              <FileText className="size-4 mr-1" /> Upload
            </Button>
          </ActionForm>
          <Button variant="outline" onClick={handleSave}>Save Draft</Button>
          <SubmitButton onClick={handleSubmit}>Submit</SubmitButton>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className={`${showPreview ? "w-1/2" : "w-full"} border-r border-line bg-background overflow-y-auto p-4`}>
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            {template.fields.map((field) => (
              <Field key={field.name} label={field.label} htmlFor={field.name} required={field.required} hint={field.hint}>
                {field.type === "textarea" && (
                  <Textarea
                    id={field.name}
                    name={field.name}
                    value={data[field.name] ?? ""}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    required={field.required}
                  />
                )}
                {field.type === "select" && (
                  <Select
                    id={field.name}
                    name={field.name}
                    value={data[field.name] ?? ""}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    required={field.required}
                  >
                    <option value="" disabled>Select…</option>
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                )}
                {field.type === "checkbox" && (
                  <Field label="" htmlFor={field.name}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        id={field.name}
                        name={field.name}
                        type="checkbox"
                        checked={data[field.name] ?? false}
                        onChange={(e) => handleChange(field.name, e.target.checked)}
                        className="h-4 w-4 rounded border-line-strong text-primary focus:ring-2 focus:ring-primary/15"
                      />
                      <span className="text-sm font-medium text-content">{field.label}</span>
                    </label>
                  </Field>
                )}
                {(field.type === "text" || field.type === "date" || field.type === "number") && (
                  <Input
                    id={field.name}
                    name={field.name}
                    type={field.type}
                    value={data[field.name] ?? ""}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    required={field.required}
                  />
                )}
              </Field>
            ))}
          </form>
        </div>
        {showPreview && (
          <div className="w-1/2 bg-surface overflow-y-auto p-4 relative">
            <div className="bg-white shadow-xl rounded-lg max-w-none mx-auto p-6">
              {template.previewTemplate(data)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}