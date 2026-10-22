-- CreateEnum
CREATE TYPE "StyleStatus" AS ENUM ('PENDING', 'ANALYZING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CorpusSource" AS ENUM ('PASTE', 'EXPORT', 'ORBIT');

-- AlterTable
ALTER TABLE "VoiceStyle" ADD COLUMN     "analyzedAt" TIMESTAMP(3),
ADD COLUMN     "analyzedPostCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "corpusHash" TEXT,
ADD COLUMN     "profileVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "StyleStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN     "statusDetail" TEXT,
ADD COLUMN     "styleProfile" JSONB;

-- CreateTable
CREATE TABLE "VoiceStyleVersion" (
    "id" TEXT NOT NULL,
    "voiceStyleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "profile" JSONB NOT NULL,
    "corpusHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceStyleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleCorpusPost" (
    "id" TEXT NOT NULL,
    "voiceStyleId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" "CorpusSource" NOT NULL,
    "postedAt" TIMESTAMP(3),
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StyleCorpusPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoiceStyleVersion_voiceStyleId_version_key" ON "VoiceStyleVersion"("voiceStyleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "StyleCorpusPost_voiceStyleId_hash_key" ON "StyleCorpusPost"("voiceStyleId", "hash");

-- AddForeignKey
ALTER TABLE "VoiceStyleVersion" ADD CONSTRAINT "VoiceStyleVersion_voiceStyleId_fkey" FOREIGN KEY ("voiceStyleId") REFERENCES "VoiceStyle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleCorpusPost" ADD CONSTRAINT "StyleCorpusPost_voiceStyleId_fkey" FOREIGN KEY ("voiceStyleId") REFERENCES "VoiceStyle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

