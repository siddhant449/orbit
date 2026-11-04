-- CreateEnum
CREATE TYPE "SavedKind" AS ENUM ('TEMPLATE', 'HOOK', 'IDEA', 'POST', 'VISUAL');

-- DropForeignKey
ALTER TABLE "TemplateSave" DROP CONSTRAINT "TemplateSave_profileId_fkey";

-- DropForeignKey
ALTER TABLE "TemplateSave" DROP CONSTRAINT "TemplateSave_templateId_fkey";

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "likeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "useCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TemplateLike" (
    "profileId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateLike_pkey" PRIMARY KEY ("profileId","templateId")
);

-- CreateTable
CREATE TABLE "SaveSpace" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaveSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedItem" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" "SavedKind" NOT NULL,
    "refId" TEXT,
    "textKey" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedItemSpace" (
    "itemId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SavedItemSpace_pkey" PRIMARY KEY ("itemId","spaceId")
);

-- CreateIndex
CREATE INDEX "TemplateLike_templateId_createdAt_idx" ON "TemplateLike"("templateId", "createdAt");

-- CreateIndex
CREATE INDEX "SaveSpace_profileId_pinned_position_idx" ON "SaveSpace"("profileId", "pinned", "position");

-- CreateIndex
CREATE INDEX "SavedItem_profileId_createdAt_idx" ON "SavedItem"("profileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedItem_profileId_kind_refId_key" ON "SavedItem"("profileId", "kind", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedItem_profileId_kind_textKey_key" ON "SavedItem"("profileId", "kind", "textKey");

-- CreateIndex
CREATE INDEX "SavedItemSpace_spaceId_position_idx" ON "SavedItemSpace"("spaceId", "position");

-- AddForeignKey
ALTER TABLE "TemplateLike" ADD CONSTRAINT "TemplateLike_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateLike" ADD CONSTRAINT "TemplateLike_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaveSpace" ADD CONSTRAINT "SaveSpace_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedItemSpace" ADD CONSTRAINT "SavedItemSpace_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SavedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedItemSpace" ADD CONSTRAINT "SavedItemSpace_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "SaveSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Move template saves into saved items (one source of truth), then drop the old table.
INSERT INTO "SavedItem" ("id", "profileId", "kind", "refId", "snapshot", "createdAt")
SELECT 'sv' || md5(ts."profileId" || ':' || ts."templateId"), ts."profileId", 'TEMPLATE', ts."templateId", jsonb_build_object('title', t."title"), ts."createdAt"
FROM "TemplateSave" ts
JOIN "Template" t ON t."id" = ts."templateId";

-- DropTable
DROP TABLE "TemplateSave";

-- Backfill the cached use counts.
UPDATE "Template" t SET "useCount" = u.n FROM (SELECT "templateId", COUNT(*)::int AS n FROM "TemplateUse" GROUP BY "templateId") u WHERE u."templateId" = t."id";
