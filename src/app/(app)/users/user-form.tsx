"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/actions/users";

const ROLES = [
  { value: "OSAS", label: "OSAS Administrator" },
  { value: "SOA", label: "SOA Administrator" },
  { value: "DEAN", label: "College Dean" },
  { value: "ADVISER_REGULAR", label: "Regular Faculty Adviser" },
  { value: "ADVISER_PARTTIME", label: "Part-Time Faculty Adviser" },
  { value: "PRESIDENT", label: "Organization President" },
  { value: "SECRETARY", label: "Organization Secretary" },
  { value: "MEMBER", label: "Organization Member" },
];

export function UserForm({
  action,
  colleges,
  departments,
  initial,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  colleges: { id: string; label: string }[];
  departments: { id: string; name: string; collegeId: string }[];
  initial?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
    role: string;
    collegeId: string | null;
    departmentId: string | null;
    studentNumber: string | null;
    positionTitle: string | null;
    isViewOnly: boolean;
  };
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [role, setRole] = useState(initial?.role ?? "MEMBER");
  const [collegeId, setCollegeId] = useState(initial?.collegeId ?? "");

  const deptOptions = departments.filter((d) => !collegeId || d.collegeId === collegeId);
  const needsCollege = ["DEAN", "ADVISER_REGULAR", "ADVISER_PARTTIME", "PRESIDENT", "SECRETARY", "MEMBER"].includes(role);

  return (
    <form action={formAction} className="space-y-5">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Email address" htmlFor="email" required className="md:col-span-2">
          <Input id="email" name="email" type="email" required defaultValue={initial?.email} placeholder="name@lspu.edu.ph" />
        </Field>

        <Field label="First name" htmlFor="firstName" required>
          <Input id="firstName" name="firstName" required maxLength={80} defaultValue={initial?.firstName} />
        </Field>
        <Field label="Last name" htmlFor="lastName" required>
          <Input id="lastName" name="lastName" required maxLength={80} defaultValue={initial?.lastName} />
        </Field>
        <Field label="Middle name" htmlFor="middleName">
          <Input id="middleName" name="middleName" maxLength={80} defaultValue={initial?.middleName ?? ""} />
        </Field>
        <Field label="System role" htmlFor="role" required>
          <Select id="role" name="role" required value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>

        {needsCollege && (
          <Field
            label="College"
            htmlFor="collegeId"
            required={role === "DEAN"}
            hint={role === "DEAN" ? "Deans manage organizations within their college." : undefined}
          >
            <Select
              id="collegeId"
              name="collegeId"
              value={collegeId}
              onChange={(e) => setCollegeId(e.target.value)}
              required={role === "DEAN"}
            >
              <option value="">None</option>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {needsCollege && (
          <Field label="Department" htmlFor="departmentId" hint="Optional">
            <Select id="departmentId" name="departmentId" defaultValue={initial?.departmentId ?? ""}>
              <option value="">None</option>
              {deptOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {(role === "PRESIDENT" || role === "SECRETARY" || role === "MEMBER") && (
          <Field label="Student number" htmlFor="studentNumber" hint="Optional">
            <Input id="studentNumber" name="studentNumber" maxLength={20} defaultValue={initial?.studentNumber ?? ""} />
          </Field>
        )}

        <Field label="Position title" htmlFor="positionTitle" hint="Optional — e.g. Faculty, Adviser">
          <Input id="positionTitle" name="positionTitle" maxLength={120} defaultValue={initial?.positionTitle ?? ""} />
        </Field>

        {!initial && (
          <Field
            label="Temporary password"
            htmlFor="password"
            required
            hint="Minimum 8 characters. The user should change it after first sign-in."
          >
            <Input id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" />
          </Field>
        )}
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-line bg-background px-4 py-3">
        <input
          type="checkbox"
          name="isViewOnly"
          defaultChecked={initial?.isViewOnly}
          className="mt-0.5 size-4 rounded border-line-strong text-primary focus:ring-primary/30"
        />
        <span className="text-sm">
          <span className="font-semibold text-content">View-only access</span>
          <span className="block text-xs text-content-secondary">
            The account can browse permitted records but cannot submit, edit, approve or sign.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

export function ResetPasswordForm({ action, userId }: { action: (prev: ActionState, formData: FormData) => Promise<ActionState>; userId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      <input type="hidden" name="id" value={userId} />
      <Field label="New password" htmlFor="new-password" required hint="Resets immediately and signs the user out of all devices.">
        <Input id="new-password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" />
      </Field>
      <SubmitButton variant="outline" size="sm" pendingLabel="Resetting…">
        Reset password
      </SubmitButton>
    </form>
  );
}
