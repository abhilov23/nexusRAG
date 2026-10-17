-- CreateEnum
CREATE TYPE "RepositoryStatus" AS ENUM ('QUEUED', 'DOWNLOADING', 'UPLOADING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "githubUrl" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultBranch" TEXT,
    "latestSha" TEXT,
    "commitSha" TEXT,
    "storageKey" TEXT,
    "sizeBytes" INTEGER,
    "pushedAt" TIMESTAMP(3),
    "license" TEXT,
    "description" TEXT,
    "status" "RepositoryStatus" NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "lastIngestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_userId_owner_name_key" ON "Repository"("userId", "owner", "name");

-- CreateIndex
CREATE INDEX "Repository_userId_idx" ON "Repository"("userId");

-- CreateIndex
CREATE INDEX "Repository_status_idx" ON "Repository"("status");

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;