-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN "proposalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_proposalId_key" ON "DocumentVersion"("documentId", "proposalId");
