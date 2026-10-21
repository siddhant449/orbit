-- CreateEnum
CREATE TYPE "MemorySource" AS ENUM ('USER', 'EXTRACTED', 'IMPORTED', 'MIRRORED');

-- CreateEnum
CREATE TYPE "VoiceKind" AS ENUM ('PRESET', 'OWN', 'URL');

-- CreateEnum
CREATE TYPE "KnowledgeType" AS ENUM ('TEXT', 'DOCUMENT', 'URL', 'VIDEO', 'IMAGE');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('MEMORY_IMPORT', 'KNOWLEDGE_INGEST', 'STRATEGY_GENERATE', 'VOICE_EXTRACT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "voiceStyleId" TEXT;

-- CreateTable
CREATE TABLE "MemoryDoc" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "source" "MemorySource" NOT NULL DEFAULT 'USER',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "goal" TEXT,
    "goalWhy" TEXT,
    "positioning" TEXT,
    "positioningWhy" TEXT,
    "tagline" TEXT,
    "expertise" TEXT,
    "expertiseWhy" TEXT,
    "contentMix" JSONB,
    "audienceBalance" JSONB,
    "contentFormats" JSONB,
    "recurringSeries" JSONB,
    "generatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceStyle" (
    "id" TEXT NOT NULL,
    "profileId" TEXT,
    "slug" TEXT,
    "kind" "VoiceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL DEFAULT '',
    "guide" TEXT NOT NULL DEFAULT '',
    "samplePosts" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceStyle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "KnowledgeType" NOT NULL,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'PROCESSING',
    "content" TEXT,
    "summary" TEXT,
    "sourceUrl" TEXT,
    "fileKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "error" TEXT,
    "shareScope" TEXT NOT NULL DEFAULT 'PROFILE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" "JobKind" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemoryDoc_profileId_key_key" ON "MemoryDoc"("profileId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_profileId_key" ON "Strategy"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceStyle_slug_key" ON "VoiceStyle"("slug");

-- CreateIndex
CREATE INDEX "VoiceStyle_profileId_idx" ON "VoiceStyle"("profileId");

-- CreateIndex
CREATE INDEX "KnowledgeItem_profileId_createdAt_idx" ON "KnowledgeItem"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "BackgroundJob_profileId_createdAt_idx" ON "BackgroundJob"("profileId", "createdAt");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_voiceStyleId_fkey" FOREIGN KEY ("voiceStyleId") REFERENCES "VoiceStyle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryDoc" ADD CONSTRAINT "MemoryDoc_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceStyle" ADD CONSTRAINT "VoiceStyle_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
