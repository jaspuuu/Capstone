-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('NOT_SCHEDULED', 'SCHEDULED', 'COMPLETED', 'FOR_ADDITIONAL_REVIEW', 'PASSED', 'NEEDS_REVISION');

-- CreateEnum
CREATE TYPE "SignatoryRole" AS ENUM ('PRESIDENT', 'SECRETARY', 'SENIOR_ADVISER', 'JUNIOR_ADVISER', 'DEAN', 'SOA', 'OSAS');

-- CreateEnum
CREATE TYPE "SignatureStepStatus" AS ENUM ('LOCKED', 'CURRENT', 'SIGNED', 'RETURNED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RouteState" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'RETURNED_FOR_REVISION', 'REJECTED');

-- DropIndex
DROP INDEX "AdviserAssignment_organizationId_type_academicYear_key";

-- AlterTable
ALTER TABLE "AdviserAssignment" ADD COLUMN     "endReason" TEXT,
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "endedById" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "logoStoredName" TEXT;

-- AlterTable
ALTER TABLE "OrganizationMember" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "status" "MembershipStatus" NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE "Recognition" ADD COLUMN     "interviewAt" TIMESTAMP(3),
ADD COLUMN     "interviewNotes" TEXT,
ADD COLUMN     "interviewStatus" "InterviewStatus" NOT NULL DEFAULT 'NOT_SCHEDULED';

-- CreateTable
CREATE TABLE "SignatureRoute" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "formKey" TEXT NOT NULL,
    "title" TEXT,
    "state" "RouteState" NOT NULL DEFAULT 'IN_PROGRESS',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureStep" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "role" "SignatoryRole" NOT NULL,
    "signerId" TEXT,
    "status" "SignatureStepStatus" NOT NULL DEFAULT 'LOCKED',
    "signedAt" TIMESTAMP(3),
    "signatureImage" TEXT,
    "signatureTyped" TEXT,
    "signatureMethod" TEXT,
    "comment" TEXT,
    "actedById" TEXT,

    CONSTRAINT "SignatureStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignatureRoute_formKey_idx" ON "SignatureRoute"("formKey");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureRoute_entityType_entityId_key" ON "SignatureRoute"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "SignatureStep_routeId_status_idx" ON "SignatureStep"("routeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureStep_routeId_order_key" ON "SignatureStep"("routeId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "AdviserAssignment_organizationId_type_academicYear_adviserI_key" ON "AdviserAssignment"("organizationId", "type", "academicYear", "adviserId");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdviserAssignment" ADD CONSTRAINT "AdviserAssignment_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRoute" ADD CONSTRAINT "SignatureRoute_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureStep" ADD CONSTRAINT "SignatureStep_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "SignatureRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureStep" ADD CONSTRAINT "SignatureStep_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureStep" ADD CONSTRAINT "SignatureStep_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
