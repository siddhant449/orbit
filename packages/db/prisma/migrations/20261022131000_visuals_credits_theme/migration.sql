-- CreateEnum
CREATE TYPE "VisualStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "VisualType" AS ENUM ('INFOGRAPHIC', 'BEFORE_AFTER', 'QUOTE', 'GENERAL');

-- CreateEnum
CREATE TYPE "VisualAspect" AS ENUM ('SQUARE', 'PORTRAIT_4_5', 'PORTRAIT_2_3', 'LANDSCAPE_3_2');

-- CreateEnum
CREATE TYPE "VisualVersionKind" AS ENUM ('GENERATED', 'EDIT', 'LOGO', 'REVERT');

-- CreateEnum
CREATE TYPE "CreditReason" AS ENUM ('MONTHLY_RESET', 'GENERATE', 'REFUND', 'ADJUSTMENT', 'ADDON');

-- CreateEnum
CREATE TYPE "BrandDecision" AS ENUM ('NONE', 'CONFIRMED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Visual" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "documentId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "VisualStatus" NOT NULL DEFAULT 'PENDING',
    "type" "VisualType" NOT NULL,
    "aspect" "VisualAspect" NOT NULL DEFAULT 'PORTRAIT_4_5',
    "userPrompt" TEXT NOT NULL,
    "builtPrompt" TEXT,
    "customInstructions" TEXT,
    "useBrandColours" BOOLEAN NOT NULL DEFAULT true,
    "referenceId" TEXT,
    "provider" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "editCount" INTEGER NOT NULL DEFAULT 0,
    "maxEdits" INTEGER NOT NULL DEFAULT 5,
    "activeOp" TEXT,
    "activeOpStartedAt" TIMESTAMP(3),
    "error" TEXT,
    "altText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Visual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualVersion" (
    "id" TEXT NOT NULL,
    "visualId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "VisualVersionKind" NOT NULL,
    "storageObjectId" TEXT NOT NULL,
    "editPrompt" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisualVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditAccount" (
    "teamId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 30,
    "monthlyAllocation" INTEGER NOT NULL DEFAULT 30,
    "periodStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("teamId")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "profileId" TEXT,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "visualId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandTheme" (
    "profileId" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "accent" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "bar" TEXT NOT NULL,
    "highlightBar" TEXT NOT NULL,
    "logoObjectId" TEXT,
    "decision" "BrandDecision" NOT NULL DEFAULT 'NONE',
    "source" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandTheme_pkey" PRIMARY KEY ("profileId")
);

-- CreateIndex
CREATE INDEX "Visual_profileId_deletedAt_createdAt_idx" ON "Visual"("profileId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Visual_documentId_idx" ON "Visual"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Visual_teamId_requestId_key" ON "Visual"("teamId", "requestId");

-- CreateIndex
CREATE INDEX "VisualVersion_storageObjectId_idx" ON "VisualVersion"("storageObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "VisualVersion_visualId_version_key" ON "VisualVersion"("visualId", "version");

-- CreateIndex
CREATE INDEX "CreditLedger_teamId_createdAt_idx" ON "CreditLedger"("teamId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedger_visualId_reason_key" ON "CreditLedger"("visualId", "reason");

-- AddForeignKey
ALTER TABLE "Visual" ADD CONSTRAINT "Visual_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visual" ADD CONSTRAINT "Visual_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visual" ADD CONSTRAINT "Visual_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualVersion" ADD CONSTRAINT "VisualVersion_visualId_fkey" FOREIGN KEY ("visualId") REFERENCES "Visual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualVersion" ADD CONSTRAINT "VisualVersion_storageObjectId_fkey" FOREIGN KEY ("storageObjectId") REFERENCES "StorageObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandTheme" ADD CONSTRAINT "BrandTheme_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandTheme" ADD CONSTRAINT "BrandTheme_logoObjectId_fkey" FOREIGN KEY ("logoObjectId") REFERENCES "StorageObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

