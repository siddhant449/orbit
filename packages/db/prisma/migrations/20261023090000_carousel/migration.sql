-- CreateTable
CREATE TABLE "Carousel" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "documentId" TEXT,
    "title" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "aspect" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '{}',
    "slides" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "pdfStorageKey" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Carousel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Carousel_profileId_deletedAt_updatedAt_idx" ON "Carousel"("profileId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "Carousel_documentId_idx" ON "Carousel"("documentId");

-- AddForeignKey
ALTER TABLE "Carousel" ADD CONSTRAINT "Carousel_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Carousel" ADD CONSTRAINT "Carousel_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
