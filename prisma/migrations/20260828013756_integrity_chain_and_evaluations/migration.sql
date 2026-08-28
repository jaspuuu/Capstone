-- AlterTable
ALTER TABLE "SignatureStep" ADD COLUMN     "chainHash" TEXT,
ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "prevChainHash" TEXT;

-- CreateTable
CREATE TABLE "ActivityEvaluation" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "relevance" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "efficiency" INTEGER NOT NULL,
    "sustainability" INTEGER NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvaluation_activityId_key" ON "ActivityEvaluation"("activityId");

-- CreateIndex
CREATE INDEX "ActivityEvaluation_activityId_idx" ON "ActivityEvaluation"("activityId");

-- AddForeignKey
ALTER TABLE "ActivityEvaluation" ADD CONSTRAINT "ActivityEvaluation_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ActivityProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvaluation" ADD CONSTRAINT "ActivityEvaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
