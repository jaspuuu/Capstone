-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('MANUAL', 'QR_CHECKIN');

-- CreateTable
CREATE TABLE "ActivityAttendance" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL',
    "recordedById" TEXT,
    "remarks" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityCheckIn" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityAttendance_activityId_idx" ON "ActivityAttendance"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityAttendance_activityId_userId_key" ON "ActivityAttendance"("activityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityCheckIn_activityId_key" ON "ActivityCheckIn"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityCheckIn_token_key" ON "ActivityCheckIn"("token");

-- AddForeignKey
ALTER TABLE "ActivityAttendance" ADD CONSTRAINT "ActivityAttendance_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ActivityProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityAttendance" ADD CONSTRAINT "ActivityAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityAttendance" ADD CONSTRAINT "ActivityAttendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityCheckIn" ADD CONSTRAINT "ActivityCheckIn_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ActivityProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityCheckIn" ADD CONSTRAINT "ActivityCheckIn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
