-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "lastActiveAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "weekStartOn" DATE NOT NULL,
    "origin" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceRef" TEXT,
    "drafted" BOOLEAN NOT NULL DEFAULT false,
    "chatId" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Idea_profileId_weekStartOn_idx" ON "Idea"("profileId", "weekStartOn");

-- CreateIndex
CREATE UNIQUE INDEX "Idea_profileId_weekStartOn_origin_position_key" ON "Idea"("profileId", "weekStartOn", "origin", "position");

-- CreateIndex
CREATE INDEX "Notification_profileId_createdAt_idx" ON "Notification"("profileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_profileId_dedupeKey_key" ON "Notification"("profileId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
