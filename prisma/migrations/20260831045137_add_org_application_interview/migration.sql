-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "interviewAt" TIMESTAMP(3),
ADD COLUMN     "interviewNotes" TEXT,
ADD COLUMN     "interviewStatus" "InterviewStatus" NOT NULL DEFAULT 'NOT_SCHEDULED';
