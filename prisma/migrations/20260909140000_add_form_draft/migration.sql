-- CreateTable
CREATE TABLE "FormDocument" (
    "id" TEXT NOT NULL,
    "formKey" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormDocumentVersion" (
    "id" TEXT NOT NULL,
    "formDocumentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "data" JSONB NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormDocument_formKey_organizationId_academicYear_key" ON "FormDocument"("formKey", "organizationId", "academicYear");

-- CreateIndex
CREATE INDEX "FormDocument_organizationId_idx" ON "FormDocument"("organizationId");

-- CreateIndex
CREATE INDEX "FormDocumentVersion_formDocumentId_idx" ON "FormDocumentVersion"("formDocumentId");

-- AddForeignKey
ALTER TABLE "FormDocumentVersion" ADD CONSTRAINT "FormDocumentVersion_formDocumentId_fkey" FOREIGN KEY ("formDocumentId") REFERENCES "FormDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
