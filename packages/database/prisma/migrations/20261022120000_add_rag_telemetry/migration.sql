-- CreateEnum
CREATE TYPE "QueryStatus" AS ENUM ('SUCCESS', 'ERROR');

-- CreateEnum
CREATE TYPE "QueryMode" AS ENUM ('CHAT', 'EVALUATION');

-- CreateEnum
CREATE TYPE "EvaluationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "EvaluationRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "name" TEXT,
    "status" "EvaluationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "retrievalK" INTEGER NOT NULL DEFAULT 10,
    "judgeAnswers" BOOLEAN NOT NULL DEFAULT true,
    "questions" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueryLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT,
    "evaluationRunId" TEXT,
    "evalQuestionIndex" INTEGER,
    "mode" "QueryMode" NOT NULL DEFAULT 'CHAT',
    "status" "QueryStatus" NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "errorMessage" TEXT,
    "grounded" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "latencyMs" INTEGER,
    "retrievalLatencyMs" INTEGER,
    "generationLatencyMs" INTEGER,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "sources" JSONB,
    "context" TEXT,
    "trace" JSONB,
    "expectedPaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "retrievalK" INTEGER,
    "recallAtK" DOUBLE PRECISION,
    "precisionAtK" DOUBLE PRECISION,
    "mrr" DOUBLE PRECISION,
    "faithfulness" DOUBLE PRECISION,
    "relevance" DOUBLE PRECISION,
    "judgeRationale" TEXT,
    "judgedAt" TIMESTAMP(3),
    "feedback" INTEGER,
    "feedbackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluationRun_userId_createdAt_idx" ON "EvaluationRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EvaluationRun_repositoryId_createdAt_idx" ON "EvaluationRun"("repositoryId", "createdAt");

-- CreateIndex
CREATE INDEX "EvaluationRun_status_idx" ON "EvaluationRun"("status");

-- CreateIndex
CREATE INDEX "QueryLog_userId_createdAt_idx" ON "QueryLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QueryLog_repositoryId_createdAt_idx" ON "QueryLog"("repositoryId", "createdAt");

-- CreateIndex
CREATE INDEX "QueryLog_evaluationRunId_idx" ON "QueryLog"("evaluationRunId");

-- CreateIndex
CREATE INDEX "QueryLog_userId_mode_createdAt_idx" ON "QueryLog"("userId", "mode", "createdAt");

-- AddForeignKey
ALTER TABLE "EvaluationRun" ADD CONSTRAINT "EvaluationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRun" ADD CONSTRAINT "EvaluationRun_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueryLog" ADD CONSTRAINT "QueryLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueryLog" ADD CONSTRAINT "QueryLog_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueryLog" ADD CONSTRAINT "QueryLog_evaluationRunId_fkey" FOREIGN KEY ("evaluationRunId") REFERENCES "EvaluationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
