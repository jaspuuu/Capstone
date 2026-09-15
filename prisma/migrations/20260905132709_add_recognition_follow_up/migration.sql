-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'CONTACTED', 'COMPLETED', 'OVERDUE', 'SKIPPED');

-- CreateTable
CREATE TABLE "RecognitionFollowUp" (
    "id" TEXT NOT NULL,
    "recognitionId" TEXT NOT NULL,
    "expectedDate" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecognitionFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecognitionFollowUp_recognitionId_key" ON "RecognitionFollowUp"("recognitionId");

-- CreateIndex
CREATE INDEX "RecognitionFollowUp_status_idx" ON "RecognitionFollowUp"("status");

-- CreateIndex
CREATE INDEX "RecognitionFollowUp_expectedDate_idx" ON "RecognitionFollowUp"("expectedDate");

-- AddForeignKey
ALTER TABLE "RecognitionFollowUp" ADD CONSTRAINT "RecognitionFollowUp_recognitionId_fkey" FOREIGN KEY ("recognitionId") REFERENCES "Recognition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecognitionFollowUp" ADD CONSTRAINT "RecognitionFollowUp_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
