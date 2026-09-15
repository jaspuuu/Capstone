import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { currentAcademicYear, formatMoney } from "@/lib/utils";
import { canUseOrgForm } from "@/lib/forms-access";
import { getSignaturesFor, type SignatureInfo } from "@/lib/signatures";
import { getSignedRolesForSf } from "@/lib/signature-routing";
import { readAttachmentFile } from "@/lib/attachments";
import { generateOfficialDocx, masterTemplatePath, type FormData } from "@/lib/docx/forms";
import { loadFormDraft, mergeDraftIntoFormData } from "@/lib/form-draft";
import { docxToPdf, PdfConversionError, pdfConversionAvailable } from "@/lib/documents/pdf";

const FORMS = new Set(["SF001", "SF002", "SF003", "SF004", "SF005", "SF006"]);

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

/** Reads a signatory's stored signature image when their role is signed
 * (§16: correct role on the current workflow state AND a saved signature). */
async function sigIfSigned(
  sigMap: Map<string, SignatureInfo>,
  signedRoles: Set<string>,
  role: string,
  userId?: string | null,
  strict = true
): Promise<{ bytes: Buffer } | null> {
  if (!userId) return null;
  if (strict && !signedRoles.has(role)) return null;
  const info = sigMap.get(userId);
  if (!info || !info.image) return null;
  const bytes = await readAttachmentFile(info.image);
  return bytes ? { bytes } : null;
}

function fullName(u: { firstName: string; middleName?: string | null; lastName: string }): string {
  return `${u.firstName}${u.middleName ? ` ${u.middleName}` : ""} ${u.lastName}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; form: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, form } = await params;
  const formKey = form.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!FORMS.has(formKey)) return NextResponse.json({ error: "Unknown form" }, { status: 404 });

  const url = new URL(_request.url);
  const ayParam = url.searchParams.get("ay") ?? "";
  const ay = /^\d{4}-\d{4}$/.test(ayParam) ? ayParam : currentAcademicYear();
  const format = (url.searchParams.get("format") ?? "docx").toLowerCase();
  if (format !== "docx" && format !== "pdf") {
    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  }
  if (format === "pdf" && !pdfConversionAvailable()) {
    return NextResponse.json(
      { error: "PDF rendering is not available on this server" },
      { status: 501 }
    );
  }

  const org = await db.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      acronym: true,
      collegeId: true,
      college: {
        select: {
          name: true,
          dean: { select: { id: true, firstName: true, lastName: true, middleName: true } },
        },
      },
      members: {
        where: { isCurrent: true, academicYear: ay },
        select: {
          position: true,
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
        select: {
          adviser: { select: { id: true, firstName: true, middleName: true, lastName: true } },
        },
      },
    },
  });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (!(await canUseOrgForm(user, org, { officersOnly: formKey === "SF005" }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const president = org.members.find((m) => m.position === "PRESIDENT")?.user;
  const secretary = org.members.find((m) => m.position === "SECRETARY")?.user;
  const dean = org.college.dean;

  const [sigMap, signedRoles] = await Promise.all([
    getSignaturesFor([
      president?.id,
      secretary?.id,
      ...org.advisers.map((a) => a.adviser.id),
      dean?.id,
      ...org.members.map((m) => m.user.id),
    ]),
    getSignedRolesForSf(formKey, org.id, ay),
  ]);

  // Current officeholders for the pre-printed approver names (approved:
  // print the current SOA/OSAS, not the stale names in the 2020 master).
  const [coordinatorUser, osasUser] = await Promise.all([
    db.user.findFirst({ where: { role: "SOA", isActive: true }, orderBy: { createdAt: "asc" } }),
    db.user.findFirst({ where: { role: "OSAS", isActive: true }, orderBy: { createdAt: "asc" } }),
  ]);

  const adviserSigs = await Promise.all(
    org.advisers.map((a) => sigIfSigned(sigMap, signedRoles, "SENIOR_ADVISER", a.adviser.id))
  );

  const memberSigBytes = await Promise.all(
    org.members.map(async (m) => {
      const info = sigMap.get(m.user.id);
      if (!info?.image) return null;
      const bytes = await readAttachmentFile(info.image);
      return bytes ? { bytes } : null;
    })
  );
  const data: FormData = {
    orgName: org.acronym ? `${org.name} (${org.acronym})` : org.name,
    date: fmtDate(new Date()),
    ay,
    semester: "1st",
    president: president
      ? {
          name: fullName(president),
          sig: await sigIfSigned(sigMap, signedRoles, "PRESIDENT", president.id),
        }
      : undefined,
    secretary: secretary
      ? {
          name: fullName(secretary),
          sig: await sigIfSigned(sigMap, signedRoles, "SECRETARY", secretary.id),
        }
      : undefined,
    advisers: org.advisers.map((a, i) => ({
      name: fullName(a.adviser),
      sig: adviserSigs[i],
    })),
    dean: dean
      ? { name: fullName(dean), sig: await sigIfSigned(sigMap, signedRoles, "DEAN", dean.id) }
      : undefined,
    adviserInfo: org.advisers[0]
      ? { name: fullName(org.advisers[0].adviser), college: org.college.name }
      : undefined,
    certifiedStudent: president
      ? {
          name: fullName(president),
          courseYearSection: president.department?.name ?? "",
          position: "President",
        }
      : undefined,
    members: org.members.map((m, i) => ({
      name: fullName(m.user),
      studentNo: m.user.studentNumber ?? "",
      courseYearSection: m.user.department?.name ?? "",
      sig: memberSigBytes[i],
    })),
  };

  if (formKey === "SF004") {
    const activities = await db.activityProposal.findMany({
      where: { organizationId: org.id, academicYear: ay, status: { not: "REJECTED" } },
      orderBy: { startAt: "asc" },
      select: { title: true, description: true, objectives: true, venue: true, startAt: true, estimatedBudget: true },
    });
    data.activities = activities.map((a) => ({
      objective: a.objectives ?? "",
      activities: a.title,
      description: a.venue ? `${a.description} — Venue: ${a.venue}` : a.description,
      persons: "",
      targetDate: fmtShort(a.startAt),
      budget: a.estimatedBudget != null ? formatMoney(a.estimatedBudget) : "",
    }));
  }

  const isDev = process.env.NODE_ENV !== "production";
  const friendlyError =
    "Unable to generate the official document. The original official template has not been modified. Please try again.";

  // Merge stored draft overrides (org name, date, AY, officer names, etc.) on
  // top of the derived default data. Undefined / empty overrides are ignored,
  // and signature bytes are never altered here.
  const draft = await loadFormDraft(formKey, org.id, ay);
  const resolvedData: FormData = draft
    ? mergeDraftIntoFormData(data, draft.data)
    : data;

  let file: Buffer;
  try {
    file = await generateOfficialDocx({
      formKey,
      data: resolvedData,
      coordinatorName: coordinatorUser ? fullName(coordinatorUser) : undefined,
      osasName: osasUser ? fullName(osasUser) : undefined,
    });
    if (file.length === 0) {
      throw new Error("Generated document is empty");
    }
  } catch (err) {
    const stage =
      err instanceof Error && "stage" in err && typeof (err as { stage?: unknown }).stage === "string"
        ? (err as { stage: string }).stage
        : "docx_generation";
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `DOCX export failed | formKey=${formKey} orgId=${id} ay=${ay} templatePath=${(() => {
        try {
          return masterTemplatePath(formKey);
        } catch (e) {
          return String((e as Error)?.message ?? e);
        }
      })()} stage=${stage} exception=${err instanceof Error ? err.name : "unknown"} message=${message} stack=${err instanceof Error ? (err.stack ?? "") : ""}`
    );
    return NextResponse.json(
      {
        error: isDev ? `Document generation failed at stage "${stage}": ${message}` : friendlyError,
        stage,
        message: isDev ? message : undefined,
      },
      { status: 500 }
    );
  }

  const slug = (org.acronym ?? org.name).replace(/[^A-Za-z0-9]+/g, "-").replace(/^[-_]+|[-_]+$/g, "");
  const filename = `LSPU-OSAS-${formKey.slice(0, 2)}-${formKey.slice(2)}-${slug}-${ay}`;

  if (format === "pdf") {
    // PDF rendering is a SEPARATE stage: a failed conversion must never be
    // reported as document-generation failure, and the DOCX stays downloadable.
    let pdf: Buffer;
    try {
      pdf = await docxToPdf(Buffer.from(file));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const reason =
        err instanceof PdfConversionError ? err.reason : "conversion_failed";
      console.error(
        `PDF conversion failed | formKey=${formKey} orgId=${id} ay=${ay} stage=pdf_conversion reason=${reason} exception=${err instanceof Error ? err.name : "unknown"} message=${message} stack=${err instanceof Error ? (err.stack ?? "") : ""}`
      );
      return NextResponse.json(
        {
          error: "Official DOCX generated successfully, but PDF conversion failed.",
          stage: "pdf_conversion",
          hint: reason,
          message: isDev ? message : undefined,
        },
        { status: 422 }
      );
    }
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}.pdf"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}.docx"`,
      "Content-Length": String(file.length),
      "Cache-Control": "private, no-store",
    },
  });
}