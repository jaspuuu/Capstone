-- CreateEnum
CREATE TYPE "MonitoringStatus" AS ENUM ('IMPLEMENTED', 'NOT_IMPLEMENTED', 'RESCHEDULED');

-- AlterTable
ALTER TABLE "AccomplishmentReport" ADD COLUMN     "budgetRemarks" TEXT,
ADD COLUMN     "conductedBy" TEXT,
ADD COLUMN     "duration" TEXT,
ADD COLUMN     "location" TEXT;

-- CreateTable
CREATE TABLE "ActivityMonitoring" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "status" "MonitoringStatus" NOT NULL DEFAULT 'NOT_IMPLEMENTED',
    "reason" TEXT,
    "rescheduledTo" TIMESTAMP(3),
    "responsibleNote" TEXT,
    "responsibleMemberIds" JSONB,
    "rescheduleHistory" JSONB,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityMonitoring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportParticipant" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "memberId" TEXT,
    "name" TEXT NOT NULL,
    "positionLabel" TEXT,
    "isOfficer" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityMonitoring_activityId_key" ON "ActivityMonitoring"("activityId");

-- CreateIndex
CREATE INDEX "ActivityMonitoring_status_idx" ON "ActivityMonitoring"("status");

-- CreateIndex
CREATE INDEX "ActivityMonitoring_activityId_status_idx" ON "ActivityMonitoring"("activityId", "status");

-- CreateIndex
CREATE INDEX "ReportParticipant_reportId_idx" ON "ReportParticipant"("reportId");

-- AddForeignKey
ALTER TABLE "ActivityMonitoring" ADD CONSTRAINT "ActivityMonitoring_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ActivityProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityMonitoring" ADD CONSTRAINT "ActivityMonitoring_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportParticipant" ADD CONSTRAINT "ReportParticipant_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AccomplishmentReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
