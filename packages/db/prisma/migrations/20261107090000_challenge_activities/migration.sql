-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "postedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ChallengeEnrollment" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeDay" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "formatId" TEXT,
    "chatId" TEXT,

    CONSTRAINT "ChallengeDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyGoal" (
    "profileId" TEXT NOT NULL,
    "preset" TEXT NOT NULL,
    "posts" INTEGER NOT NULL,
    "comments" INTEGER NOT NULL,
    "dms" INTEGER NOT NULL,
    "connections" INTEGER NOT NULL,

    CONSTRAINT "WeeklyGoal_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "GoalTally" (
    "profileId" TEXT NOT NULL,
    "weekStartOn" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GoalTally_pkey" PRIMARY KEY ("profileId","weekStartOn","kind")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "repeat" TEXT NOT NULL,
    "weekday" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "pausedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDone" (
    "taskId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "TaskDone_pkey" PRIMARY KEY ("taskId","date")
);

-- CreateTable
CREATE TABLE "Badge" (
    "profileId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("profileId","badgeId")
);

-- CreateIndex
CREATE INDEX "Document_profileId_postedAt_idx" ON "Document"("profileId", "postedAt");

-- CreateIndex
CREATE INDEX "ChallengeEnrollment_profileId_createdAt_idx" ON "ChallengeEnrollment"("profileId", "createdAt");

-- One running challenge per profile: an enrollment that is neither ended nor completed. Two concurrent starts cannot both insert.
CREATE UNIQUE INDEX "ChallengeEnrollment_one_active_per_profile" ON "ChallengeEnrollment"("profileId") WHERE "endedAt" IS NULL AND "completedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeDay_enrollmentId_dayNumber_key" ON "ChallengeDay"("enrollmentId", "dayNumber");

-- CreateIndex
CREATE INDEX "Task_profileId_position_idx" ON "Task"("profileId", "position");

-- AddForeignKey
ALTER TABLE "ChallengeEnrollment" ADD CONSTRAINT "ChallengeEnrollment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeDay" ADD CONSTRAINT "ChallengeDay_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ChallengeEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyGoal" ADD CONSTRAINT "WeeklyGoal_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalTally" ADD CONSTRAINT "GoalTally_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDone" ADD CONSTRAINT "TaskDone_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge" ADD CONSTRAINT "Badge_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
