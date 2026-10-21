CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "ChunkSource" AS ENUM ('KNOWLEDGE');

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "sourceType" "ChunkSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(1536),
    "tsv" tsvector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeChunk_profileId_sourceType_idx" ON "KnowledgeChunk"("profileId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeChunk_sourceType_sourceId_ordinal_key" ON "KnowledgeChunk"("sourceType", "sourceId", "ordinal");

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "KnowledgeChunk_embedding_hnsw" ON "KnowledgeChunk" USING hnsw (embedding vector_cosine_ops);
CREATE INDEX "KnowledgeChunk_tsv_gin" ON "KnowledgeChunk" USING gin (tsv);
