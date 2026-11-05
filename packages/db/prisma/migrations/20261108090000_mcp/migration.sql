-- AlterEnum
ALTER TYPE "VersionSource" ADD VALUE 'ASSISTANT';

-- CreateTable
CREATE TABLE "McpBinding" (
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpBinding_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "McpClient" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "McpClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "McpBinding_profileId_idx" ON "McpBinding"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "McpClient_userId_clientId_key" ON "McpClient"("userId", "clientId");

-- AddForeignKey
ALTER TABLE "McpBinding" ADD CONSTRAINT "McpBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpBinding" ADD CONSTRAINT "McpBinding_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpClient" ADD CONSTRAINT "McpClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
