-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('ACTION_REQUIRED', 'ATTENTION', 'INFO', 'SUCCESS');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('SIGNATURE', 'REVIEW', 'REVISION', 'APPROVAL', 'DEADLINE', 'INTERVIEW', 'SUBMISSION', 'MEMBERSHIP', 'ACTIVITY', 'REPORT', 'FINANCIAL', 'FOLLOW_UP', 'SYSTEM');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "dedupKey" TEXT,
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "entityType" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "groupCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "priority" "NotificationPriority" NOT NULL DEFAULT 'INFO',
ADD COLUMN     "reason" TEXT;

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_category_key" ON "NotificationPreference"("userId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupKey_key" ON "Notification"("dedupKey");

-- CreateIndex
CREATE INDEX "Notification_organizationId_idx" ON "Notification"("organizationId");

-- CreateIndex
CREATE INDEX "Notification_entityType_entityId_idx" ON "Notification"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Notification_userId_archivedAt_idx" ON "Notification"("userId", "archivedAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
