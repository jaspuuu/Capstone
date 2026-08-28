// ORGanIZE seed — demo data for the LSPU-OSAS core foundation.
// All demo accounts use the password: Password123!
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, RecognitionStatus } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { formRoute, sfRouteEntityId } from "../src/lib/form-routes";
import {
  hashChainStep,
  signatureContentHash,
  signatureContentPayload,
} from "../src/lib/signature-integrity";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const AY_PREV = "2025-2026";
const AY_CUR = "2026-2027";

type EventInput = {
  recognitionId: string;
  actorId?: string;
  action: string;
  fromStatus?: RecognitionStatus;
  toStatus?: RecognitionStatus;
  note?: string;
  createdAt: Date;
};

async function main() {
  console.log("Seeding ORGanIZE…");
  const pw = await hashPassword("Password123!");

  // ---------------------------------------------------------------- Users
  const osas = await prisma.user.upsert({
    where: { email: "osas@lspu.edu.ph" },
    update: {},
    create: {
      email: "osas@lspu.edu.ph",
      passwordHash: pw,
      firstName: "Maria Elena",
      lastName: "Santos",
      middleName: "Reyes",
      role: "OSAS",
      positionTitle: "Director, Office of Student Affairs and Services",
    },
  });

  const soa = await prisma.user.upsert({
    where: { email: "soa@lspu.edu.ph" },
    update: {},
    create: {
      email: "soa@lspu.edu.ph",
      passwordHash: pw,
      firstName: "Jonathan",
      lastName: "Cruz",
      role: "SOA",
      positionTitle: "Student Activities Coordinator",
    },
  });

  const deanCcs = await prisma.user.upsert({
    where: { email: "dean.ccs@lspu.edu.ph" },
    update: {},
    create: {
      email: "dean.ccs@lspu.edu.ph",
      passwordHash: pw,
      firstName: "Rodrigo",
      lastName: "Dela Peña",
      role: "DEAN",
      positionTitle: "College Dean",
    },
  });

  const adviserRegular = await prisma.user.upsert({
    where: { email: "adviser.regular@lspu.edu.ph" },
    update: {},
    create: {
      email: "adviser.regular@lspu.edu.ph",
      passwordHash: pw,
      firstName: "Angelica",
      lastName: "Ramos",
      role: "ADVISER_REGULAR",
      positionTitle: "Associate Professor",
    },
  });

  const adviserParttime = await prisma.user.upsert({
    where: { email: "adviser.parttime@lspu.edu.ph" },
    update: {},
    create: {
      email: "adviser.parttime@lspu.edu.ph",
      passwordHash: pw,
      firstName: "Miguel",
      lastName: "Bautista",
      role: "ADVISER_PARTTIME",
      positionTitle: "Part-Time Lecturer",
    },
  });

  const presidentAcs = await prisma.user.upsert({
    where: { email: "president.acs@lspu.edu.ph" },
    update: {},
    create: {
      email: "president.acs@lspu.edu.ph",
      passwordHash: pw,
      firstName: "Kevin",
      lastName: "Ocampo",
      role: "PRESIDENT",
      studentNumber: "2021-04512",
      positionTitle: "Student",
    },
  });

  const secretaryJpia = await prisma.user.upsert({
    where: { email: "secretary.jpia@lspu.edu.ph" },
    update: {},
    create: {
      email: "secretary.jpia@lspu.edu.ph",
      passwordHash: pw,
      firstName: "Andrea",
      lastName: "Villanueva",
      role: "SECRETARY",
      studentNumber: "2022-07330",
      positionTitle: "Student",
    },
  });

  const member1 = await prisma.user.upsert({
    where: { email: "member1.acs@lspu.edu.ph" },
    update: {},
    create: {
      email: "member1.acs@lspu.edu.ph",
      passwordHash: pw,
      firstName: "Joshua",
      lastName: "Mendoza",
      role: "MEMBER",
      studentNumber: "2023-11021",
      positionTitle: "Student",
    },
  });

  // ------------------------------------------------------------ Colleges
  const ccs = await prisma.college.upsert({
    where: { code: "CCS" },
    update: { deanId: deanCcs.id },
    create: { name: "College of Computer Studies", code: "CCS", deanId: deanCcs.id },
  });
  // Deans are scoped by their account's college — keep both sides in sync.
  await prisma.user.update({ where: { id: deanCcs.id }, data: { collegeId: ccs.id } });
  const coe = await prisma.college.upsert({
    where: { code: "COE" },
    update: {},
    create: { name: "College of Engineering", code: "COE" },
  });
  const cba = await prisma.college.upsert({
    where: { code: "CBA" },
    update: {},
    create: { name: "College of Business Administration", code: "CBA" },
  });
  await prisma.college.upsert({
    where: { code: "COEd" },
    update: {},
    create: { name: "College of Education", code: "COEd" },
  });
  await prisma.college.upsert({
    where: { code: "CAS" },
    update: {},
    create: { name: "College of Arts and Sciences", code: "CAS" },
  });
  await prisma.college.upsert({
    where: { code: "CON" },
    update: {},
    create: { name: "College of Nursing", code: "CON" },
  });

  await prisma.department.upsert({
    where: { code: "IT" },
    update: {},
    create: { name: "Information Technology", code: "IT", collegeId: ccs.id },
  });
  await prisma.department.upsert({
    where: { code: "CS" },
    update: {},
    create: { name: "Computer Science", code: "CS", collegeId: ccs.id },
  });
  await prisma.department.upsert({
    where: { code: "EE" },
    update: {},
    create: { name: "Electrical Engineering", code: "EE", collegeId: coe.id },
  });
  await prisma.department.upsert({
    where: { code: "ACCTG" },
    update: {},
    create: { name: "Accountancy", code: "ACCTG", collegeId: cba.id },
  });

  // College hosting the hospitality-management mother organization.
  const ofhmCollege = await prisma.college.upsert({
    where: { code: "OFHM" },
    update: {},
    create: { name: "Organization of Future Hospitality Managers", code: "OFHM" },
  });

  // ------------------------------------------- Remove placeholder mock orgs
  // Previous demo dataset — replaced by the CCS-SBO/OFHM/CBAA-SBO hierarchy
  // below. All child records cascade with the organization row.
  for (const acronym of ["ESC", "PSME", "IECEP", "ACS", "JPIA", "PSYCH", "FEO"]) {
    const old = await prisma.organization.findFirst({ where: { acronym }, select: { id: true } });
    if (!old) continue;
    const recIds = (
      await prisma.recognition.findMany({ where: { organizationId: old.id }, select: { id: true } })
    ).map((r) => r.id);
    if (recIds.length) {
      await prisma.attachment.deleteMany({ where: { entityType: "Recognition", entityId: { in: recIds } } });
    }
    await prisma.organization.delete({ where: { id: old.id } });
  }

  // ------------------------------------------------------- Organizations
  // Demo hierarchy: three mother orgs; CCS-SBO has two sub-organizations.
  // Idempotent by acronym lookup.
  const mkOrg = async (
    acronym: string,
    data: { name: string; description?: string; type: "MOTHER" | "CHILD" | "INDEPENDENT"; parentId?: string; collegeId: string; departmentId?: string; foundedYear?: number },
  ) => {
    const existing = await prisma.organization.findFirst({
      where: { acronym },
      select: { id: true, name: true, acronym: true },
    });
    if (existing) return existing;
    return prisma.organization.create({
      data: { acronym, applicationStatus: "RECOGNIZED", ...data },
    });
  };

  const ccsSbo = await mkOrg("CCS-SBO", {
    name: "CCS Student Body Organization",
    description:
      "The mother organization of all College of Computer Studies student organizations, coordinating college-wide activities.",
    type: "MOTHER",
    collegeId: ccs.id,
    foundedYear: 1998,
  });
  const ofhm = await mkOrg("OFHM", {
    name: "Organization of Future Hospitality Managers",
    description:
      "Mother organization for hospitality-management student organizations under OFHM.",
    type: "MOTHER",
    collegeId: ofhmCollege.id,
    foundedYear: 2005,
  });
  const cbaaSbo = await mkOrg("CBAA-SBO", {
    name: "CBAA Student Body Organization",
    description:
      "The mother organization of all College of Business Administration and Accountancy student organizations.",
    type: "MOTHER",
    collegeId: cba.id,
    foundedYear: 1995,
  });
  const graphicos = await mkOrg("GRAPHICOS", {
    name: "Graphicos",
    description:
      "Sub-organization of CCS-SBO for design, multimedia, and visual computing enthusiasts.",
    type: "CHILD",
    parentId: ccsSbo.id,
    collegeId: ccs.id,
    foundedYear: 2012,
  });
  const robotics = await mkOrg("ROBOTICS", {
    name: "Robotics",
    description:
      "Sub-organization of CCS-SBO focused on robotics, embedded systems, and automation projects.",
    type: "CHILD",
    parentId: ccsSbo.id,
    collegeId: ccs.id,
    foundedYear: 2016,
  });

  // ------------------------------------------------- Members & advisers
  await prisma.organizationMember.createMany({
    data: [
      { organizationId: ccsSbo.id, userId: presidentAcs.id, position: "PRESIDENT", academicYear: AY_CUR },
      { organizationId: robotics.id, userId: member1.id, position: "MEMBER", academicYear: AY_CUR },
      { organizationId: graphicos.id, userId: secretaryJpia.id, position: "SECRETARY", academicYear: AY_CUR },
    ],
    skipDuplicates: true,
  });

  await prisma.adviserAssignment.createMany({
    data: [
      { organizationId: ccsSbo.id, adviserId: adviserRegular.id, type: "REGULAR", academicYear: AY_CUR },
      { organizationId: graphicos.id, adviserId: adviserParttime.id, type: "PART_TIME", academicYear: AY_CUR },
    ],
    skipDuplicates: true,
  });

  // -------------------------------------------------------- Recognitions
  // Skip if this run (or a previous one) already seeded the current AY.
  const seeded = await prisma.recognition.findFirst({ where: { academicYear: AY_CUR } });
  if (!seeded) {
  const decidedHistory = async (
    orgId: string,
    ay: string,
    kind: "INITIAL" | "RENEWAL",
    finalStatus: "RECOGNIZED" | "REJECTED",
  ) => {
    const rec = await prisma.recognition.create({
      data: {
        organizationId: orgId,
        academicYear: ay,
        kind,
        status: finalStatus,
        submittedAt: new Date("2025-08-20T09:00:00+08:00"),
        reviewedAt: new Date("2025-08-28T10:00:00+08:00"),
        decidedAt: new Date("2025-09-05T14:00:00+08:00"),
        decidedById: osas.id,
        remarks:
          finalStatus === "RECOGNIZED"
            ? "Complete requirements. Granted full recognition."
            : "Incomplete documentary requirements.",
      },
    });
    const events: EventInput[] = [
      { recognitionId: rec.id, actorId: osas.id, action: "CREATED", toStatus: "DRAFT", createdAt: new Date("2025-08-15T08:00:00+08:00") },
      { recognitionId: rec.id, actorId: osas.id, action: "SUBMITTED", fromStatus: "DRAFT", toStatus: "SUBMITTED", createdAt: new Date("2025-08-20T09:00:00+08:00") },
      { recognitionId: rec.id, actorId: deanCcs.id, action: "STARTED_REVIEW", fromStatus: "SUBMITTED", toStatus: "UNDER_REVIEW", createdAt: new Date("2025-08-28T10:00:00+08:00") },
      { recognitionId: rec.id, actorId: deanCcs.id, action: "ENDORSED", fromStatus: "UNDER_REVIEW", toStatus: "FOR_APPROVAL", note: "Requirements verified.", createdAt: new Date("2025-08-29T11:00:00+08:00") },
      {
        recognitionId: rec.id,
        actorId: osas.id,
        action: finalStatus === "RECOGNIZED" ? "APPROVED" : "REJECTED",
        fromStatus: "FOR_APPROVAL",
        toStatus: finalStatus === "RECOGNIZED" ? "APPROVED" : "REJECTED",
        createdAt: new Date("2025-09-05T14:00:00+08:00"),
      },
    ];
    if (finalStatus === "RECOGNIZED") {
      events.push({ recognitionId: rec.id, actorId: osas.id, action: "CONFERRED", fromStatus: "APPROVED", toStatus: "RECOGNIZED", createdAt: new Date("2025-09-06T09:00:00+08:00") });
    }
    await prisma.recognitionEvent.createMany({ data: events });
  };

  // Previous AY history — every demo organization is an established one.
  await decidedHistory(ccsSbo.id, AY_PREV, "INITIAL", "RECOGNIZED");
  await decidedHistory(ofhm.id, AY_PREV, "INITIAL", "RECOGNIZED");
  await decidedHistory(cbaaSbo.id, AY_PREV, "RENEWAL", "RECOGNIZED");
  await decidedHistory(graphicos.id, AY_PREV, "INITIAL", "RECOGNIZED");
  await decidedHistory(robotics.id, AY_PREV, "INITIAL", "RECOGNIZED");

  // Current AY — renewed and fully recognized.
  await decidedHistory(ccsSbo.id, AY_CUR, "RENEWAL", "RECOGNIZED");
  await decidedHistory(ofhm.id, AY_CUR, "RENEWAL", "RECOGNIZED");
  await decidedHistory(cbaaSbo.id, AY_CUR, "RENEWAL", "RECOGNIZED");
  await decidedHistory(graphicos.id, AY_CUR, "RENEWAL", "RECOGNIZED");
  await decidedHistory(robotics.id, AY_CUR, "RENEWAL", "RECOGNIZED");
  } else {
    console.log("Recognitions for AY %s already present — skipping lifecycle seed.", AY_CUR);
  }

  // ----------------------------------------------------------- Deadlines
  const deadlineCount = await prisma.deadline.count();
  if (deadlineCount === 0) {
    await prisma.deadline.createMany({
    data: [
      {
        createdById: osas.id,
        name: "Renewal of Recognition AY 2026-2027",
        process: "RENEWAL",
        academicYear: AY_CUR,
        startDate: new Date("2026-08-03T08:00:00+08:00"),
        dueDate: new Date("2026-09-15T17:00:00+08:00"),
        scopeType: "ALL",
        instructions:
          "Submit the complete renewal packet through the system: updated officer roster, adviser endorsement, and general program of activities.",
      },
      {
        createdById: osas.id,
        name: "Initial Recognition Applications AY 2026-2027",
        process: "RECOGNITION",
        academicYear: AY_CUR,
        startDate: new Date("2026-09-01T08:00:00+08:00"),
        dueDate: new Date("2026-10-30T17:00:00+08:00"),
        scopeType: "ALL",
        instructions:
          "New organizations seeking initial recognition must complete the application form and attach founding documents.",
      },
      {
        createdById: osas.id,
        name: "First Semester Activity Proposals",
        process: "ACTIVITY",
        academicYear: AY_CUR,
        startDate: new Date("2026-10-01T08:00:00+08:00"),
        dueDate: new Date("2026-11-15T17:00:00+08:00"),
        scopeType: "ALL",
      },
      {
        createdById: osas.id,
        name: "Accomplishment Reports AY 2025-2026 (CLOSED)",
        process: "ACCOMPLISHMENT",
        academicYear: AY_PREV,
        startDate: new Date("2026-06-01T08:00:00+08:00"),
        dueDate: new Date("2026-07-15T17:00:00+08:00"),
        scopeType: "ALL",
        isActive: false,
      },
    ],
    });
  }

  // ------------------------------------------------- Activities & reports
  // Skip if proposals were already seeded by a previous run.
  const activityCount = await prisma.activityProposal.count();
  if (activityCount === 0) {
    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
    const daysAhead = (n: number) => new Date(now.getTime() + n * 86_400_000);

    // 1) Fully processed proposal + accepted report -> ACCOMPLISHMENT phase.
    const assembly = await prisma.activityProposal.create({
      data: {
        organizationId: ccsSbo.id,
        title: "General Assembly and Team Building",
        description:
          "Annual general assembly to present the organization's program of activities, followed by a team-building session for members.",
        venue: "CCS Lecture Hall",
        startAt: daysAgo(30),
        endAt: daysAgo(30),
        scope: "ORGANIZATION",
        estimatedBudget: 8500,
        expectedParticipants: 45,
        academicYear: AY_CUR,
        status: "APPROVED",
        phase: "ACCOMPLISHMENT",
        submittedAt: daysAgo(38),
        decidedAt: daysAgo(35),
        decidedById: deanCcs.id,
      },
    });
    await prisma.auditLog.createMany({
      data: [
        { userId: presidentAcs.id, action: "ACTIVITY_CREATED", entityType: "ActivityProposal", entityId: assembly.id, entityLabel: assembly.title, newState: { organizationId: ccsSbo.id, scope: "ORGANIZATION", status: "DRAFT" }, createdAt: daysAgo(40), ipAddress: "127.0.0.1" },
        { userId: presidentAcs.id, action: "ACTIVITY_SUBMITTED", entityType: "ActivityProposal", entityId: assembly.id, entityLabel: assembly.title, newState: { status: "SUBMITTED" }, createdAt: daysAgo(38), ipAddress: "127.0.0.1" },
        { userId: adviserRegular.id, action: "ACTIVITY_ENDORSED", entityType: "ActivityProposal", entityId: assembly.id, entityLabel: assembly.title, newState: { status: "ENDORSED" }, createdAt: daysAgo(36), ipAddress: "127.0.0.1" },
        { userId: deanCcs.id, action: "ACTIVITY_APPROVED", entityType: "ActivityProposal", entityId: assembly.id, entityLabel: assembly.title, newState: { status: "APPROVED" }, createdAt: daysAgo(35), ipAddress: "127.0.0.1" },
      ],
    });

    const assemblyReport = await prisma.accomplishmentReport.create({
      data: {
        organizationId: ccsSbo.id,
        activityProposalId: assembly.id,
        title: "Accomplishment Report — General Assembly and Team Building",
        narrative:
          "The general assembly was attended by 52 members. The program of activities was presented and ratified. The team-building session strengthened camaraderie among members. Documentation and attendance sheets are on file with the adviser.",
        heldOn: daysAgo(30),
        actualParticipants: 52,
        actualBudget: 7900,
        academicYear: AY_CUR,
        status: "ACCEPTED",
        submittedAt: daysAgo(23),
        reviewedAt: daysAgo(22),
        decidedById: osas.id,
      },
    });
    await prisma.auditLog.createMany({
      data: [
        { userId: presidentAcs.id, action: "REPORT_CREATED", entityType: "AccomplishmentReport", entityId: assemblyReport.id, entityLabel: assemblyReport.title, newState: { organizationId: ccsSbo.id, status: "DRAFT" }, createdAt: daysAgo(24), ipAddress: "127.0.0.1" },
        { userId: presidentAcs.id, action: "REPORT_SUBMITTED", entityType: "AccomplishmentReport", entityId: assemblyReport.id, entityLabel: assemblyReport.title, newState: { status: "SUBMITTED" }, createdAt: daysAgo(23), ipAddress: "127.0.0.1" },
        { userId: osas.id, action: "REPORT_ACCEPTED", entityType: "AccomplishmentReport", entityId: assemblyReport.id, entityLabel: assemblyReport.title, newState: { status: "ACCEPTED" }, createdAt: daysAgo(22), ipAddress: "127.0.0.1" },
        { userId: osas.id, action: "ACTIVITY_COMPLETED", entityType: "ActivityProposal", entityId: assembly.id, entityLabel: assembly.title, newState: { status: "COMPLETED", viaReportId: assemblyReport.id }, createdAt: daysAgo(22), ipAddress: "127.0.0.1" },
      ],
    });

    // 2) Submitted proposal awaiting endorsement.
    const seminar = await prisma.activityProposal.create({
      data: {
        organizationId: graphicos.id,
        title: "Digital Design Bootcamp",
        description:
          "Half-day workshop on brand and layout design fundamentals, open to CCS students college-wide.",
        venue: "LSPU Auditorium",
        startAt: daysAhead(14),
        endAt: daysAhead(14),
        scope: "COLLEGE",
        estimatedBudget: 12000,
        expectedParticipants: 80,
        academicYear: AY_CUR,
        status: "SUBMITTED",
        submittedAt: daysAgo(2),
      },
    });
    await prisma.auditLog.createMany({
      data: [
        { userId: secretaryJpia.id, action: "ACTIVITY_CREATED", entityType: "ActivityProposal", entityId: seminar.id, entityLabel: seminar.title, newState: { organizationId: graphicos.id, scope: "COLLEGE", status: "DRAFT" }, createdAt: daysAgo(3), ipAddress: "127.0.0.1" },
        { userId: secretaryJpia.id, action: "ACTIVITY_SUBMITTED", entityType: "ActivityProposal", entityId: seminar.id, entityLabel: seminar.title, newState: { status: "SUBMITTED" }, createdAt: daysAgo(2), ipAddress: "127.0.0.1" },
      ],
    });

    // 3) Draft proposal not yet submitted.
    const outreach = await prisma.activityProposal.create({
      data: {
        organizationId: robotics.id,
        title: "Robotics Community Outreach",
        description:
          "University-wide outreach: introductory robotics and programming workshops for senior high school students of partner schools.",
        venue: "Partner School Campus",
        startAt: daysAhead(30),
        endAt: daysAhead(31),
        scope: "UNIVERSITY",
        estimatedBudget: 15000,
        expectedParticipants: 120,
        academicYear: AY_CUR,
        status: "DRAFT",
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: member1.id,
        action: "ACTIVITY_CREATED",
        entityType: "ActivityProposal",
        entityId: outreach.id,
        entityLabel: outreach.title,
        newState: { organizationId: robotics.id, scope: "UNIVERSITY", status: "DRAFT" },
        createdAt: daysAgo(1),
        ipAddress: "127.0.0.1",
      },
    });
  } else {
    console.log("Activities/reports already present — skipping seed.");
  }

  // ------------------------------------------------------- M&E evaluation
  const evaluationCount = await prisma.activityEvaluation.count();
  if (evaluationCount === 0) {
    const completedActivity = await prisma.activityProposal.findFirst({
      where: {
        organizationId: ccsSbo.id,
        academicYear: AY_CUR,
        report: { isNot: null },
      },
      select: { id: true, title: true },
    });
    if (completedActivity && osas) {
      await prisma.activityEvaluation.upsert({
        where: { activityId: completedActivity.id },
        update: {},
        create: {
          activityId: completedActivity.id,
          evaluatorId: osas.id,
          relevance: 5,
          impact: 4,
          efficiency: 4,
          sustainability: 4,
          remarks: "Well-attended; recommend a bigger venue next cycle and earlier archiving of outputs.",
        },
      });
      console.log(`M&E evaluation recorded for “${completedActivity.title}”.`);
    }
  }

  // ------------------------------------------------------- Signature chain demo (SF-001)
  // A fully signed SF-001 route so the smoke suite can assert the integrity
  // badge renders "Signature chain verified" on the print form page. Hashes are
  // computed with the real functions so verification matches the production path.
  const sfFormKey = "SF001";
  const sfEntityId = sfRouteEntityId(sfFormKey, ccsSbo.id, AY_CUR);
  const existingSfRoute = await prisma.signatureRoute.findUnique({
    where: { entityType_entityId: { entityType: "SF", entityId: sfEntityId } },
    select: { id: true },
  });
  if (!existingSfRoute) {
    const sfRoles = formRoute(sfFormKey);
    if (sfRoles.length > 0) {
      const sfTitle = "Application for Recognition/Renewal";
      const sfSignedAtBase = new Date("2026-08-10T09:00:00+08:00");
      const sfContentHash = signatureContentHash(
        signatureContentPayload({
          entityType: "SF",
          entityId: sfEntityId,
          formKey: sfFormKey,
          title: sfTitle,
          version: 1,
          orgId: ccsSbo.id,
          academicYear: AY_CUR,
        })
      );
      const signers = [presidentAcs, secretaryJpia, adviserRegular, deanCcs];
      let prevChainHash: string | null = null;
      const sfSteps = sfRoles.map((role, i) => {
        const signedAt = new Date(sfSignedAtBase.getTime() + i * 86_400_000);
        const chainHash = hashChainStep({
          role,
          signerId: signers[i].id,
          signedAt,
          method: "TYPED",
          contentHash: sfContentHash,
          prevChainHash,
        });
        const step = {
          order: i + 1,
          role,
          signerId: signers[i].id,
          actedById: signers[i].id,
          status: "SIGNED" as const,
          signedAt,
          signatureMethod: "TYPED",
          contentHash: sfContentHash,
          prevChainHash,
          chainHash,
        };
        prevChainHash = chainHash;
        return step;
      });
      await prisma.signatureRoute.create({
        data: {
          entityType: "SF",
          entityId: sfEntityId,
          formKey: sfFormKey,
          title: sfTitle,
          state: "COMPLETED",
          version: 1,
          createdById: osas.id,
          steps: { create: sfSteps },
        },
      });
      console.log(
        `Signature chain demo created on SF-001 for ${ccsSbo.acronym ?? ccsSbo.name ?? "CCS-SBO"} · AY ${AY_CUR} (${sfRoles.length} signed steps).`
      );
    }
  }

  // ------------------------------------------------------- Attachments
  const attachmentCount = await prisma.attachment.count();
  if (attachmentCount === 0) {
    const ccsSboRec = await prisma.recognition.findFirst({
      where: { organizationId: ccsSbo.id, academicYear: AY_CUR },
    });
    const graphicosRec = await prisma.recognition.findFirst({
      where: { organizationId: graphicos.id, academicYear: AY_CUR },
    });
    if ((ccsSboRec || graphicosRec) && presidentAcs) {
      // 1x1 PNG so each demo file is valid and renders inline.
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "base64",
      );
      const dir = path.join(process.cwd(), "storage", "uploads");
      await mkdir(dir, { recursive: true });

      // Tagged SF-001 checklist samples: CCS-SBO near-complete, Graphicos starting out.
      const samples: {
        recognitionId: string;
        kind: string;
        fileName: string;
      }[] = [];
      if (ccsSboRec) {
        for (const kind of [
          "CONSTITUTION",
          "PLAN_OF_ACTIVITIES",
          "ADVISER_COMMITMENT",
          "CERTIFICATION",
          "FINANCIAL_REPORT",
        ]) {
          samples.push({ recognitionId: ccsSboRec.id, kind, fileName: `ccs-sbo-${kind.toLowerCase()}.png` });
        }
      }
      if (graphicosRec) {
        samples.push({ recognitionId: graphicosRec.id, kind: "CONSTITUTION", fileName: "graphicos-constitution.png" });
      }

      for (const s of samples) {
        const storedName = `${randomBytes(24).toString("hex")}.png`;
        await writeFile(path.join(dir, storedName), png);
        await prisma.attachment.create({
          data: {
            entityType: "Recognition",
            entityId: s.recognitionId,
            fileName: s.fileName,
            storedName,
            mimeType: "image/png",
            sizeBytes: png.length,
            kind: s.kind as never,
            uploadedById: presidentAcs.id,
          },
        });
        await prisma.auditLog.create({
          data: {
            userId: presidentAcs.id,
            action: "ATTACHMENT_UPLOADED",
            entityType: "Recognition",
            entityId: s.recognitionId,
            entityLabel: s.fileName,
            newState: { mimeType: "image/png", sizeBytes: png.length, kind: s.kind },
            ipAddress: "127.0.0.1",
          },
        });
      }
    }
  } else {
    console.log("Attachments already present — skipping seed.");
  }

  // ---------------------------------------------------------- Audit trail
  await prisma.auditLog.createMany({
    data: [
      {
        userId: osas.id,
        action: "USER_CREATED",
        entityType: "User",
        entityId: soa.id,
        entityLabel: "soa@lspu.edu.ph",
        newState: { role: "SOA" },
        ipAddress: "127.0.0.1",
      },
      {
        userId: osas.id,
        action: "DEADLINE_CREATED",
        entityType: "Deadline",
        entityLabel: "Renewal of Recognition AY 2026-2027",
        newState: { process: "RENEWAL", academicYear: AY_CUR },
        ipAddress: "127.0.0.1",
      },
    ],
  });

  console.log("Seed complete.");
  console.log("Demo accounts (password: Password123!):");
  console.log("  osas@lspu.edu.ph · soa@lspu.edu.ph · dean.ccs@lspu.edu.ph");
  console.log("  adviser.regular@lspu.edu.ph · adviser.parttime@lspu.edu.ph");
  console.log("  president.acs@lspu.edu.ph · secretary.jpia@lspu.edu.ph · member1.acs@lspu.edu.ph");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
