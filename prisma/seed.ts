// ORGanIZE seed — demo data for the LSPU-OSAS core foundation.
// All demo accounts use the password: Password123!
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, RecognitionStatus } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";

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
  const coed = await prisma.college.upsert({
    where: { code: "COEd" },
    update: {},
    create: { name: "College of Education", code: "COEd" },
  });
  const cas = await prisma.college.upsert({
    where: { code: "CAS" },
    update: {},
    create: { name: "College of Arts and Sciences", code: "CAS" },
  });
  await prisma.college.upsert({
    where: { code: "CON" },
    update: {},
    create: { name: "College of Nursing", code: "CON" },
  });

  const itDept = await prisma.department.upsert({
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
  const acctgDept = await prisma.department.upsert({
    where: { code: "ACCTG" },
    update: {},
    create: { name: "Accountancy", code: "ACCTG", collegeId: cba.id },
  });

  // ------------------------------------------------------- Organizations
  // Idempotent by acronym lookup.
  const mkOrg = async (
    acronym: string,
    data: { name: string; description?: string; type: "MOTHER" | "CHILD" | "INDEPENDENT"; parentId?: string; collegeId: string; departmentId?: string; foundedYear?: number },
  ) => {
    const existing = await prisma.organization.findFirst({ where: { acronym }, select: { id: true } });
    if (existing) return existing;
    return prisma.organization.create({ data: { acronym, ...data } });
  };

  const esc = await mkOrg("ESC", {
    name: "Engineering Student Council",
    description:
      "The mother organization of all engineering-based student organizations, coordinating college-wide activities.",
    type: "MOTHER",
    collegeId: coe.id,
    foundedYear: 1998,
  });
  await mkOrg("PSME", {
    name: "Philippine Society of Mechanical Engineers – LSPU Chapter",
    description: "Student chapter of PSME for mechanical engineering students.",
    type: "CHILD",
    parentId: esc.id,
    collegeId: coe.id,
    foundedYear: 2004,
  });
  await mkOrg("IECEP", {
    name: "Institute of Electronics Engineers of the Philippines – Student Chapter",
    description: "Student chapter of IECEP for electronics engineering students.",
    type: "CHILD",
    parentId: esc.id,
    collegeId: coe.id,
    foundedYear: 2007,
  });
  const acs = await mkOrg("ACS", {
    name: "Association of Computing Students",
    description:
      "The premier student organization for Information Technology and Computer Science students of CCS.",
    type: "INDEPENDENT",
    collegeId: ccs.id,
    departmentId: itDept.id,
    foundedYear: 2001,
  });
  const jpia = await mkOrg("JPIA", {
    name: "Junior Philippine Institute of Accountants – LSPU Chapter",
    description: "Official student organization of Accountancy students.",
    type: "INDEPENDENT",
    collegeId: cba.id,
    departmentId: acctgDept.id,
    foundedYear: 1995,
  });
  const psych = await mkOrg("PSYCH", {
    name: "Psychology Society",
    description: "Academic organization for BS Psychology students.",
    type: "INDEPENDENT",
    collegeId: cas.id,
    foundedYear: 2010,
  });
  // An org whose recognition lapsed — demonstrates EXPIRED state.
  const feo = await mkOrg("FEO", {
    name: "Future Educators Organization",
    description: "Organization of pre-service teachers.",
    type: "INDEPENDENT",
    collegeId: coed.id,
    foundedYear: 2003,
  });

  // ------------------------------------------------- Members & advisers
  await prisma.organizationMember.createMany({
    data: [
      { organizationId: acs.id, userId: presidentAcs.id, position: "PRESIDENT", academicYear: AY_CUR },
      { organizationId: acs.id, userId: member1.id, position: "MEMBER", academicYear: AY_CUR },
      { organizationId: jpia.id, userId: secretaryJpia.id, position: "SECRETARY", academicYear: AY_CUR },
    ],
    skipDuplicates: true,
  });

  await prisma.adviserAssignment.createMany({
    data: [
      { organizationId: acs.id, adviserId: adviserRegular.id, type: "REGULAR", academicYear: AY_CUR },
      { organizationId: jpia.id, adviserId: adviserRegular.id, type: "REGULAR", academicYear: AY_CUR },
      { organizationId: psych.id, adviserId: adviserParttime.id, type: "PART_TIME", academicYear: AY_CUR },
      { organizationId: esc.id, adviserId: adviserRegular.id, type: "REGULAR", academicYear: AY_CUR },
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

  // Previous AY history
  await decidedHistory(acs.id, AY_PREV, "INITIAL", "RECOGNIZED");
  await decidedHistory(jpia.id, AY_PREV, "INITIAL", "RECOGNIZED");
  await decidedHistory(psych.id, AY_PREV, "INITIAL", "RECOGNIZED");
  await decidedHistory(feo.id, AY_PREV, "INITIAL", "REJECTED");

  // Current AY pipeline in various stages
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  const pipeline = async (
    orgId: string,
    status: "SUBMITTED" | "UNDER_REVIEW" | "FOR_APPROVAL" | "DRAFT",
    kind: "INITIAL" | "RENEWAL",
  ) => {
    const rec = await prisma.recognition.create({
      data: {
        organizationId: orgId,
        academicYear: AY_CUR,
        kind,
        status,
        submittedAt: status !== "DRAFT" ? daysAgo(4) : null,
        reviewedAt: status === "UNDER_REVIEW" || status === "FOR_APPROVAL" ? daysAgo(2) : null,
        decidedById: status === "FOR_APPROVAL" ? deanCcs.id : null,
      },
    });
    const events: EventInput[] = [
      { recognitionId: rec.id, actorId: presidentAcs.id, action: "CREATED", toStatus: "DRAFT", createdAt: daysAgo(5) },
    ];
    if (status !== "DRAFT") {
      events.push({ recognitionId: rec.id, actorId: presidentAcs.id, action: "SUBMITTED", fromStatus: "DRAFT", toStatus: "SUBMITTED", createdAt: daysAgo(4) });
    }
    if (status === "UNDER_REVIEW" || status === "FOR_APPROVAL") {
      events.push({ recognitionId: rec.id, actorId: deanCcs.id, action: "STARTED_REVIEW", fromStatus: "SUBMITTED", toStatus: "UNDER_REVIEW", createdAt: daysAgo(2) });
    }
    if (status === "FOR_APPROVAL") {
      events.push({ recognitionId: rec.id, actorId: deanCcs.id, action: "ENDORSED", fromStatus: "UNDER_REVIEW", toStatus: "FOR_APPROVAL", note: "All documents in order.", createdAt: daysAgo(1) });
    }
    await prisma.recognitionEvent.createMany({ data: events });
  };

  await pipeline(jpia.id, "SUBMITTED", "RENEWAL");
  await pipeline(acs.id, "UNDER_REVIEW", "RENEWAL");
  await pipeline(psych.id, "FOR_APPROVAL", "RENEWAL");
  await pipeline(esc.id, "DRAFT", "RENEWAL");
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

    // 1) Fully processed proposal + accepted report -> COMPLETED.
    const assembly = await prisma.activityProposal.create({
      data: {
        organizationId: acs.id,
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
        status: "COMPLETED",
        submittedAt: daysAgo(38),
        decidedAt: daysAgo(35),
        decidedById: deanCcs.id,
      },
    });
    await prisma.auditLog.createMany({
      data: [
        { userId: presidentAcs.id, action: "ACTIVITY_CREATED", entityType: "ActivityProposal", entityId: assembly.id, entityLabel: assembly.title, newState: { organizationId: acs.id, scope: "ORGANIZATION", status: "DRAFT" }, createdAt: daysAgo(40), ipAddress: "127.0.0.1" },
        { userId: presidentAcs.id, action: "ACTIVITY_SUBMITTED", entityType: "ActivityProposal", entityId: assembly.id, entityLabel: assembly.title, newState: { status: "SUBMITTED" }, createdAt: daysAgo(38), ipAddress: "127.0.0.1" },
        { userId: adviserRegular.id, action: "ACTIVITY_ENDORSED", entityType: "ActivityProposal", entityId: assembly.id, entityLabel: assembly.title, newState: { status: "ENDORSED" }, createdAt: daysAgo(36), ipAddress: "127.0.0.1" },
        { userId: deanCcs.id, action: "ACTIVITY_APPROVED", entityType: "ActivityProposal", entityId: assembly.id, entityLabel: assembly.title, newState: { status: "APPROVED" }, createdAt: daysAgo(35), ipAddress: "127.0.0.1" },
      ],
    });

    const assemblyReport = await prisma.accomplishmentReport.create({
      data: {
        organizationId: acs.id,
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
        { userId: presidentAcs.id, action: "REPORT_CREATED", entityType: "AccomplishmentReport", entityId: assemblyReport.id, entityLabel: assemblyReport.title, newState: { organizationId: acs.id, status: "DRAFT" }, createdAt: daysAgo(24), ipAddress: "127.0.0.1" },
        { userId: presidentAcs.id, action: "REPORT_SUBMITTED", entityType: "AccomplishmentReport", entityId: assemblyReport.id, entityLabel: assemblyReport.title, newState: { status: "SUBMITTED" }, createdAt: daysAgo(23), ipAddress: "127.0.0.1" },
        { userId: osas.id, action: "REPORT_ACCEPTED", entityType: "AccomplishmentReport", entityId: assemblyReport.id, entityLabel: assemblyReport.title, newState: { status: "ACCEPTED" }, createdAt: daysAgo(22), ipAddress: "127.0.0.1" },
        { userId: osas.id, action: "ACTIVITY_COMPLETED", entityType: "ActivityProposal", entityId: assembly.id, entityLabel: assembly.title, newState: { status: "COMPLETED", viaReportId: assemblyReport.id }, createdAt: daysAgo(22), ipAddress: "127.0.0.1" },
      ],
    });

    // 2) Submitted proposal awaiting endorsement.
    const seminar = await prisma.activityProposal.create({
      data: {
        organizationId: jpia.id,
        title: "Seminar on Ethical Accounting Practice",
        description:
          "Half-day seminar featuring a guest CPA speaker on ethics in professional practice, open to accountancy students college-wide.",
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
        { userId: secretaryJpia.id, action: "ACTIVITY_CREATED", entityType: "ActivityProposal", entityId: seminar.id, entityLabel: seminar.title, newState: { organizationId: jpia.id, scope: "COLLEGE", status: "DRAFT" }, createdAt: daysAgo(3), ipAddress: "127.0.0.1" },
        { userId: secretaryJpia.id, action: "ACTIVITY_SUBMITTED", entityType: "ActivityProposal", entityId: seminar.id, entityLabel: seminar.title, newState: { status: "SUBMITTED" }, createdAt: daysAgo(2), ipAddress: "127.0.0.1" },
      ],
    });

    // 3) Draft proposal not yet submitted.
    const outreach = await prisma.activityProposal.create({
      data: {
        organizationId: acs.id,
        title: "Community Outreach Program",
        description:
          "University-wide outreach: computer literacy training for senior high school students of partner schools.",
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
        userId: presidentAcs.id,
        action: "ACTIVITY_CREATED",
        entityType: "ActivityProposal",
        entityId: outreach.id,
        entityLabel: outreach.title,
        newState: { organizationId: acs.id, scope: "UNIVERSITY", status: "DRAFT" },
        createdAt: daysAgo(1),
        ipAddress: "127.0.0.1",
      },
    });
  } else {
    console.log("Activities/reports already present — skipping seed.");
  }

  // ------------------------------------------------------- Attachments
  const attachmentCount = await prisma.attachment.count();
  if (attachmentCount === 0) {
    const acsRec = await prisma.recognition.findFirst({
      where: { organizationId: acs.id, academicYear: AY_CUR },
    });
    const jpiaRec = await prisma.recognition.findFirst({
      where: { organizationId: jpia.id, academicYear: AY_CUR },
    });
    if ((acsRec || jpiaRec) && presidentAcs) {
      // 1x1 PNG so each demo file is valid and renders inline.
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "base64",
      );
      const dir = path.join(process.cwd(), "storage", "uploads");
      await mkdir(dir, { recursive: true });

      // Tagged SF-001 checklist samples: ACS near-complete, JPIA starting out.
      const samples: {
        recognitionId: string;
        kind: string;
        fileName: string;
      }[] = [];
      if (acsRec) {
        for (const kind of [
          "CONSTITUTION",
          "PLAN_OF_ACTIVITIES",
          "ADVISER_COMMITMENT",
          "CERTIFICATION",
          "FINANCIAL_REPORT",
        ]) {
          samples.push({ recognitionId: acsRec.id, kind, fileName: `acs-${kind.toLowerCase()}.png` });
        }
      }
      if (jpiaRec) {
        samples.push({ recognitionId: jpiaRec.id, kind: "CONSTITUTION", fileName: "jpia-constitution.png" });
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
