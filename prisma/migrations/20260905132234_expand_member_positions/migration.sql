-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MemberPosition" ADD VALUE 'VICE_PRESIDENT';
ALTER TYPE "MemberPosition" ADD VALUE 'TREASURER';
ALTER TYPE "MemberPosition" ADD VALUE 'AUDITOR';
ALTER TYPE "MemberPosition" ADD VALUE 'PUBLIC_INFORMATION_OFFICER';
ALTER TYPE "MemberPosition" ADD VALUE 'BUSINESS_MANAGER';
ALTER TYPE "MemberPosition" ADD VALUE 'OTHER';
