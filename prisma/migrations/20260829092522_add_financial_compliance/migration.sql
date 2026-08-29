-- CreateEnum
CREATE TYPE "FinancialProcess" AS ENUM ('RECOGNITION', 'RENEWAL', 'ACTIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancialSubmissionStatus" AS ENUM ('DRAFT', 'INCOMPLETE', 'SUBMITTED', 'UNDER_REVIEW', 'RETURNED', 'RESUBMITTED', 'APPROVED', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AttachmentKind" ADD VALUE 'FINANCIAL_DOCUMENT';
ALTER TYPE "AttachmentKind" ADD VALUE 'FINANCIAL_SUPPORTING';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "FinancialRequirement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "process" "FinancialProcess" NOT NULL DEFAULT 'RECOGNITION',
    "signers" "SignatoryRole"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialSubmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "status" "FinancialSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "deadlineId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "resubmittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialComment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialRequirement_code_key" ON "FinancialRequirement"("code");

-- CreateIndex
CREATE INDEX "FinancialRequirement_process_isActive_idx" ON "FinancialRequirement"("process", "isActive");

-- CreateIndex
CREATE INDEX "FinancialSubmission_organizationId_academicYear_idx" ON "FinancialSubmission"("organizationId", "academicYear");

-- CreateIndex
CREATE INDEX "FinancialSubmission_status_idx" ON "FinancialSubmission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialSubmission_organizationId_academicYear_requirement_key" ON "FinancialSubmission"("organizationId", "academicYear", "requirementId");

-- CreateIndex
CREATE INDEX "FinancialComment_submissionId_idx" ON "FinancialComment"("submissionId");

-- AddForeignKey
ALTER TABLE "FinancialRequirement" ADD CONSTRAINT "FinancialRequirement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSubmission" ADD CONSTRAINT "FinancialSubmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSubmission" ADD CONSTRAINT "FinancialSubmission_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "FinancialRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSubmission" ADD CONSTRAINT "FinancialSubmission_deadlineId_fkey" FOREIGN KEY ("deadlineId") REFERENCES "Deadline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSubmission" ADD CONSTRAINT "FinancialSubmission_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSubmission" ADD CONSTRAINT "FinancialSubmission_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSubmission" ADD CONSTRAINT "FinancialSubmission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialComment" ADD CONSTRAINT "FinancialComment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FinancialSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialComment" ADD CONSTRAINT "FinancialComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
