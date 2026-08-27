-- Step 1: Create ActivityPhase enum (no dependencies)
CREATE TYPE "ActivityPhase" AS ENUM ('PLAN', 'PROPOSAL', 'APPROVAL', 'IMPLEMENTATION', 'MONITORING', 'ACCOMPLISHMENT', 'ARCHIVE');

-- Step 2: Add phase column to ActivityProposal
ALTER TABLE "ActivityProposal" ADD COLUMN "phase" "ActivityPhase" NOT NULL DEFAULT 'PLAN';

-- Step 3: Set phase for existing proposals based on their status
UPDATE "ActivityProposal" SET "phase" = 'PROPOSAL' WHERE "status" = 'SUBMITTED';
UPDATE "ActivityProposal" SET "phase" = 'APPROVAL' WHERE "status" IN ('ENDORSED', 'RETURNED');
UPDATE "ActivityProposal" SET "phase" = 'IMPLEMENTATION' WHERE "status" = 'APPROVED';
UPDATE "ActivityProposal" SET "phase" = 'ARCHIVE' WHERE "status" = 'REJECTED';

-- Step 4: Convert COMPLETED proposals to APPROVED + ACCOMPLISHMENT phase
UPDATE "ActivityProposal" SET "status" = 'APPROVED', "phase" = 'ACCOMPLISHMENT' WHERE "status" = 'COMPLETED';

-- Step 5: Create new ProposalStatus enum (without COMPLETED)
CREATE TYPE "ProposalStatus_new" AS ENUM ('DRAFT', 'SUBMITTED', 'ENDORSED', 'APPROVED', 'RETURNED', 'REJECTED');
ALTER TABLE "ActivityProposal" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ActivityProposal" ALTER COLUMN "status" TYPE "ProposalStatus_new" USING ("status"::text::"ProposalStatus_new");
ALTER TYPE "ProposalStatus" RENAME TO "ProposalStatus_old";
ALTER TYPE "ProposalStatus_new" RENAME TO "ProposalStatus";
DROP TYPE "ProposalStatus_old";
ALTER TABLE "ActivityProposal" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- Step 6: Create new MembershipStatus enum (with workflow states)
ALTER TABLE "OrganizationMember" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "OrganizationMember" ALTER COLUMN "status" TYPE text;
UPDATE "OrganizationMember" SET "status" = 'APPLIED' WHERE "status" = 'PENDING';
UPDATE "OrganizationMember" SET "status" = 'ACTIVE' WHERE "status" = 'APPROVED';
CREATE TYPE "MembershipStatus_new" AS ENUM ('APPLIED', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'INACTIVE', 'REJECTED', 'REMOVED');
ALTER TABLE "OrganizationMember" ALTER COLUMN "status" TYPE "MembershipStatus_new" USING ("status"::"MembershipStatus_new");
ALTER TYPE "MembershipStatus" RENAME TO "MembershipStatus_old";
ALTER TYPE "MembershipStatus_new" RENAME TO "MembershipStatus";
DROP TYPE "MembershipStatus_old";
ALTER TABLE "OrganizationMember" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- Step 7: Add FOR_SIGNATURE to RecognitionStatus
ALTER TYPE "RecognitionStatus" ADD VALUE 'FOR_SIGNATURE';
