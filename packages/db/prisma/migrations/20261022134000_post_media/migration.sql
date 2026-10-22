-- CreateEnum
CREATE TYPE "PostMediaKind" AS ENUM ('IMAGE', 'DOCUMENT');

-- CreateTable
CREATE TABLE "PostMedia" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" "PostMediaKind" NOT NULL,
    "position" INTEGER NOT NULL,
    "visualId" TEXT,
    "storageObjectId" TEXT NOT NULL,
    "altText" TEXT,
    "linkedinAssetUrn" TEXT,
    "frozenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostMedia_documentId_position_idx" ON "PostMedia"("documentId", "position");

-- CreateIndex
CREATE INDEX "PostMedia_visualId_idx" ON "PostMedia"("visualId");

-- CreateIndex
CREATE UNIQUE INDEX "PostMedia_documentId_visualId_key" ON "PostMedia"("documentId", "visualId");

-- AddForeignKey
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_visualId_fkey" FOREIGN KEY ("visualId") REFERENCES "Visual"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_storageObjectId_fkey" FOREIGN KEY ("storageObjectId") REFERENCES "StorageObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

