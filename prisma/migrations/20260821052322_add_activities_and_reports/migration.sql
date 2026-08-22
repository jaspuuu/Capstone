-- CreateEnum
CREATE TYPE "ActivityScope" AS ENUM ('ORGANIZATION', 'COLLEGE', 'UNIVERSITY');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ENDORSED', 'APPROVED', 'RETURNED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'RETURNED');

-- CreateTable
CREATE TABLE "ActivityProposal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "venue" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "scope" "ActivityScope" NOT NULL DEFAULT 'ORGANIZATION',
    "estimatedBudget" DOUBLE PRECISION,
    "expectedParticipants" INTEGER,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccomplishmentReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "activityProposalId" TEXT,
    "academicYear" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "heldOn" TIMESTAMP(3) NOT NULL,
    "actualParticipants" INTEGER,
    "actualBudget" DOUBLE PRECISION,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccomplishmentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityProposal_organizationId_idx" ON "ActivityProposal"("organizationId");

-- CreateIndex
CREATE INDEX "ActivityProposal_status_idx" ON "ActivityProposal"("status");

-- CreateIndex
CREATE INDEX "ActivityProposal_academicYear_idx" ON "ActivityProposal"("academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "AccomplishmentReport_activityProposalId_key" ON "AccomplishmentReport"("activityProposalId");

-- CreateIndex
CREATE INDEX "AccomplishmentReport_organizationId_idx" ON "AccomplishmentReport"("organizationId");

-- CreateIndex
CREATE INDEX "AccomplishmentReport_status_idx" ON "AccomplishmentReport"("status");

-- CreateIndex
CREATE INDEX "AccomplishmentReport_academicYear_idx" ON "AccomplishmentReport"("academicYear");

-- AddForeignKey
ALTER TABLE "ActivityProposal" ADD CONSTRAINT "ActivityProposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityProposal" ADD CONSTRAINT "ActivityProposal_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccomplishmentReport" ADD CONSTRAINT "AccomplishmentReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccomplishmentReport" ADD CONSTRAINT "AccomplishmentReport_activityProposalId_fkey" FOREIGN KEY ("activityProposalId") REFERENCES "ActivityProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccomplishmentReport" ADD CONSTRAINT "AccomplishmentReport_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
