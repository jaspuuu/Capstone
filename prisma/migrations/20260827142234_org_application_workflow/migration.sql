-- CreateEnum
CREATE TYPE "OrgApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'FOR_SIGNATURE', 'FOR_APPROVAL', 'APPROVED', 'RECOGNIZED', 'RETURNED', 'REJECTED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "applicationRemark" TEXT,
ADD COLUMN     "applicationStatus" "OrgApplicationStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- Backfill: organizations that predate the application workflow are established.
UPDATE "Organization" SET "applicationStatus" = 'RECOGNIZED', "submittedAt" = COALESCE("submittedAt", "createdAt"), "decidedAt" = COALESCE("decidedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Organization_applicationStatus_idx" ON "Organization"("applicationStatus");
