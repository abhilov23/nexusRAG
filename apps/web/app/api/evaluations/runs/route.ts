import { NextResponse } from "next/server";

import { db } from "@repo/database";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  latestPerQuestion,
  runQuerySelect,
  runSelect,
  serializeRun,
  summarizeRun,
} from "@/lib/evaluations/runs";
import type { BenchmarkQuestion, RunListItem } from "@/lib/evaluations/types";
import { readJsonBody } from "@/lib/security/body";
import { rejectCrossOrigin } from "@/lib/security/csrf";
import {
  RATE_LIMITS,
  checkRateLimit,
  clientIdentifier,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

function readQuestions(value: unknown): BenchmarkQuestion[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) return null;
  const questions: BenchmarkQuestion[] = [];

  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const question = typeof record.question === "string" ? record.question.trim() : "";
    if (!question || question.length > 2000) return null;

    const rawPaths = record.expectedPaths;
    if (rawPaths !== undefined && !Array.isArray(rawPaths)) return null;
    const expectedPaths = Array.isArray(rawPaths)
      ? rawPaths
          .filter(
            (path): path is string =>
              typeof path === "string" && path.trim().length > 0 && path.length <= 500,
          )
          .slice(0, 50)
          .map((path) => path.trim())
      : [];

    if (Array.isArray(rawPaths) && expectedPaths.length !== rawPaths.length) {
      return null;
    }

    questions.push({ question, expectedPaths });
  }

  return questions;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const limit = await checkRateLimit(`eval-runs:${user.id}`, {
      limit: RATE_LIMITS.readQueue.limit,
      windowSeconds: RATE_LIMITS.readQueue.windowSeconds,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "Too many requests." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const runs = await db.evaluationRun.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: runSelect,
    });

    if (runs.length === 0) {
      return NextResponse.json({ runs: [] }, { headers: rateLimitHeaders(limit) });
    }

    const queries = await db.queryLog.findMany({
      where: {
        userId: user.id,
        evaluationRunId: { in: runs.map((run) => run.id) },
      },
      orderBy: { createdAt: "asc" },
      select: runQuerySelect,
    });

    const byRun = new Map<string, typeof queries>();
    for (const query of queries) {
      if (!query.evaluationRunId) continue;
      const group = byRun.get(query.evaluationRunId) ?? [];
      group.push(query);
      byRun.set(query.evaluationRunId, group);
    }

    const payload: RunListItem[] = runs.map((run) => {
      const deduped = latestPerQuestion(byRun.get(run.id) ?? []);
      return serializeRun(run, summarizeRun(deduped));
    });

    return NextResponse.json({ runs: payload }, { headers: rateLimitHeaders(limit) });
  } catch (error) {
    console.error("evaluation runs GET error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const csrf = rejectCrossOrigin(request);
    if (csrf) return csrf;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const limit = await checkRateLimit(`eval-run-start:${user.id}:${clientIdentifier(request)}`, {
      limit: RATE_LIMITS.benchmarkStart.limit,
      windowSeconds: RATE_LIMITS.benchmarkStart.windowSeconds,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "Too many benchmark runs. Try again later." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const body = parsed.value as {
      repositoryId?: unknown;
      name?: unknown;
      retrievalK?: unknown;
      judgeAnswers?: unknown;
      questions?: unknown;
    };

    const repositoryId = typeof body.repositoryId === "string" ? body.repositoryId : "";
    if (!repositoryId) {
      return NextResponse.json({ message: "A repository is required" }, { status: 400 });
    }

    const questions = readQuestions(body.questions);
    if (!questions) {
      return NextResponse.json(
        { message: "Provide between 1 and 50 questions, each under 2000 characters." },
        { status: 400 },
      );
    }

    const repository = await db.repository.findFirst({
      where: { id: repositoryId, userId: user.id },
      select: { id: true, status: true },
    });
    if (!repository) {
      return NextResponse.json({ message: "Repository not found" }, { status: 404 });
    }
    if (repository.status !== "READY") {
      return NextResponse.json(
        { message: "The repository must finish indexing before it can be evaluated." },
        { status: 409 },
      );
    }

    const requestedK =
      typeof body.retrievalK === "number" && Number.isFinite(body.retrievalK)
        ? Math.round(body.retrievalK)
        : 10;
    const retrievalK = Math.min(Math.max(requestedK, 1), 50);
    const name =
      typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : null;
    const judgeAnswers = body.judgeAnswers !== false;

    const run = await db.evaluationRun.create({
      data: {
        userId: user.id,
        repositoryId: repository.id,
        name,
        retrievalK,
        judgeAnswers,
        questions: questions as unknown as object,
      },
      select: runSelect,
    });

    return NextResponse.json(
      { run: serializeRun(run, summarizeRun([])) },
      { status: 201, headers: rateLimitHeaders(limit) },
    );
  } catch (error) {
    console.error("evaluation runs POST error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
