-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "academicYear" TEXT;

-- CreateIndex
CREATE INDEX "Notification_academicYear_idx" ON "Notification"("academicYear");
