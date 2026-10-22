import { NextResponse } from "next/server";

import { db } from "@repo/database";
import { getCurrentUser } from "@/lib/auth/current-user";
import { computeRetrievalMetrics } from "@/lib/evaluations/metrics";
import { requestJudge, type JudgeResult } from "@/lib/evaluations/judge";
import type {
  BenchmarkQuestion,
  QueryMode,
  QueryTrace,
  TraceSource,
} from "@/lib/evaluations/types";
import { readJsonBody } from "@/lib/security/body";
import { rejectCrossOrigin } from "@/lib/security/csrf";
import {
  RATE_LIMITS,
  checkRateLimit,
  clientIdentifier,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

const MAX_SOURCE_CHARS = 8_000;
const MAX_CONTEXT_CHARS = 60_000;
const MAX_ANSWER_CHARS = 20_000;

type JsonRecord = Record<string, unknown>;

type BuiltTrace = {
  sources: TraceSource[];
  trace: QueryTrace;
  context: string | null;
  grounded: boolean;
  model: string | null;
  tokens: { prompt: number; completion: number; total: number };
  costUsd: number;
  retrievalLatencyMs: number | null;
  generationLatencyMs: number | null;
  sourceCount: number;
};

type EvaluationMeta = {
  runId: string;
  questionIndex: number;
};

type RunContext = {
  id: string;
  repositoryId: string;
  retrievalK: number;
  judgeAnswers: boolean;
  question: string;
  expectedPaths: string[];
};

function asRecord(value: unknown): JsonRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}\n… truncated` : value;
}

function readExpectedPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (path): path is string =>
        typeof path === "string" && path.trim().length > 0 && path.length <= 500,
    )
    .slice(0, 50)
    .map((path) => path.trim());
}

function readRunQuestion(value: unknown, index: number): BenchmarkQuestion | null {
  if (!Array.isArray(value)) return null;
  const record = asRecord(value[index]);
  if (!record) return null;
  const question = stringValue(record.question)?.trim();
  if (!question) return null;
  return { question, expectedPaths: readExpectedPaths(record.expectedPaths) };
}

function normalizeChunk(
  value: unknown,
  fallbackIndex: number,
  includeContent: boolean,
): TraceSource | null {
  const record = asRecord(value);
  if (!record) return null;
  const path = stringValue(record.path);
  if (!path) return null;

  const ranks: Record<string, number> = {};
  const ranksRecord = asRecord(record.ranks);
  if (ranksRecord) {
    for (const [name, rank] of Object.entries(ranksRecord)) {
      if (typeof rank === "number" && Number.isFinite(rank)) ranks[name] = rank;
    }
  }

  const content = includeContent ? stringValue(record.content) : null;

  return {
    index: numberValue(record.index) ?? fallbackIndex,
    repository_id: stringValue(record.repository_id) ?? stringValue(record.repositoryId) ?? "",
    path,
    language: stringValue(record.language) ?? "",
    symbol: stringValue(record.symbol),
    kind: stringValue(record.kind) ?? "block",
    start_line: numberValue(record.start_line) ?? numberValue(record.startLine) ?? 0,
    end_line: numberValue(record.end_line) ?? numberValue(record.endLine) ?? 0,
    score: numberValue(record.score) ?? 0,
    ranks,
    ...(content ? { content: truncate(content, MAX_SOURCE_CHARS) } : {}),
  };
}

/**
 * Convert the Python service payload into the two shapes we store:
 * `sources` for the trace drawer (code included) and `trace` for counters.
 * Content is omitted from the trace copy to avoid doubling JSON storage.
 */
function buildTrace(payload: JsonRecord): BuiltTrace {
  const retrieval = asRecord(payload.retrieval);
  const rawChunks = Array.isArray(retrieval?.chunks)
    ? retrieval.chunks
    : Array.isArray(payload.sources)
      ? payload.sources
      : [];

  const sources = rawChunks
    .map((chunk, index) => normalizeChunk(chunk, index + 1, true))
    .filter((chunk): chunk is TraceSource => chunk !== null);

  const traceChunks = sources.map(({ content: _content, ...chunk }) => chunk);

  const tokensRecord = asRecord(payload.tokens);
  const prompt = numberValue(tokensRecord?.prompt) ?? 0;
  const completion = numberValue(tokensRecord?.completion) ?? 0;
  const total = numberValue(tokensRecord?.total) ?? prompt + completion;

  const timingsRecord = asRecord(payload.timings);
  const timings = timingsRecord
    ? {
        embed_ms: numberValue(timingsRecord.embed_ms) ?? 0,
        retrieval_ms: numberValue(timingsRecord.retrieval_ms) ?? 0,
        generation_ms: numberValue(timingsRecord.generation_ms) ?? 0,
        total_ms: numberValue(timingsRecord.total_ms) ?? 0,
      }
    : null;

  const rawContext = stringValue(payload.context);
  const context = rawContext ? truncate(rawContext, MAX_CONTEXT_CHARS) : null;

  const trace: QueryTrace = {
    model: stringValue(payload.model) ?? undefined,
    tokens: { prompt, completion, total },
    cost_usd: numberValue(payload.cost_usd) ?? 0,
    grounded: payload.grounded === true,
    ...(timings ? { timings } : {}),
    retrieval: {
      vector_hits: numberValue(retrieval?.vector_hits) ?? 0,
      lexical_hits: numberValue(retrieval?.lexical_hits) ?? 0,
      fused: numberValue(retrieval?.fused) ?? 0,
      deduped: numberValue(retrieval?.deduped) ?? 0,
      returned: numberValue(retrieval?.returned) ?? sources.length,
      vector_ms: numberValue(retrieval?.vector_ms) ?? 0,
      lexical_ms: numberValue(retrieval?.lexical_ms) ?? 0,
      fusion_ms: numberValue(retrieval?.fusion_ms) ?? 0,
      chunks: traceChunks,
    },
  };

  return {
    sources,
    trace,
    context,
    grounded: payload.grounded === true,
    model: stringValue(payload.model),
    tokens: { prompt, completion, total },
    costUsd: numberValue(payload.cost_usd) ?? 0,
    retrievalLatencyMs: timings ? Math.round(timings.embed_ms + timings.retrieval_ms) : null,
    generationLatencyMs: timings ? Math.round(timings.generation_ms) : null,
    sourceCount: sources.length,
  };
}

type RecordInput = {
  userId: string;
  repositoryId: string | null;
  evaluationRunId: string | null;
  evalQuestionIndex: number | null;
  mode: QueryMode;
  question: string;
  status: "SUCCESS" | "ERROR";
  answer: string | null;
  errorMessage: string | null;
  latencyMs: number;
  built?: BuiltTrace;
  expectedPaths: string[];
  retrievalK: number | null;
  retrievalMetrics: ReturnType<typeof computeRetrievalMetrics>;
};

/** Best-effort: telemetry must never turn a successful answer into a 500. */
async function recordQuery(input: RecordInput): Promise<string | null> {
  try {
    const row = await db.queryLog.create({
      data: {
        userId: input.userId,
        repositoryId: input.repositoryId,
        evaluationRunId: input.evaluationRunId,
        evalQuestionIndex: input.evalQuestionIndex,
        mode: input.mode,
        status: input.status,
        question: input.question,
        answer: input.answer ? truncate(input.answer, MAX_ANSWER_CHARS) : null,
        errorMessage: input.errorMessage,
        grounded: input.built?.grounded ?? false,
        model: input.built?.model ?? null,
        latencyMs: input.latencyMs,
        retrievalLatencyMs: input.built?.retrievalLatencyMs ?? null,
        generationLatencyMs: input.built?.generationLatencyMs ?? null,
        promptTokens: input.built?.tokens.prompt ?? 0,
        completionTokens: input.built?.tokens.completion ?? 0,
        totalTokens: input.built?.tokens.total ?? 0,
        costUsd: input.built?.costUsd ?? 0,
        sourceCount: input.built?.sourceCount ?? 0,
        sources: input.built?.sources.length
          ? (input.built.sources as unknown as object)
          : undefined,
        context: input.built?.context,
        trace: input.built?.trace as unknown as object,
        expectedPaths: input.expectedPaths,
        retrievalK: input.retrievalK,
        recallAtK: input.retrievalMetrics?.recallAtK ?? null,
        precisionAtK: input.retrievalMetrics?.precisionAtK ?? null,
        mrr: input.retrievalMetrics?.mrr ?? null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    console.error("[ask] could not persist query log", error);
    return null;
  }
}

async function judgeAndStore(input: {
  userId: string;
  queryId: string | null;
  question: string;
  answer: string;
  context: string;
}): Promise<JudgeResult | null> {
  try {
    const result = await requestJudge({
      question: input.question,
      answer: input.answer,
      context: input.context,
    });
    if (input.queryId) {
      await db.queryLog.updateMany({
        where: { id: input.queryId, userId: input.userId },
        data: {
          faithfulness: result.faithfulness,
          relevance: result.relevance,
          judgeRationale: result.rationale,
          judgedAt: new Date(),
        },
      });
    }
    return result;
  } catch (error) {
    // A judge outage must not fail the answer that already succeeded.
    console.error(
      "[ask] automatic judge failed",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

/**
 * Asks a question about the user's indexed repositories.
 *
 * This is a server-side proxy so the browser never talks to the AI service
 * directly: it keeps the Python service off the public surface, and it lets
 * ownership be enforced here. The repository list is taken from the database,
 * never from the request, so a caller cannot search someone else's index.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const csrf = rejectCrossOrigin(request);
    if (csrf) return csrf;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const body = asRecord(parsed.value) ?? {};

    let evaluation: EvaluationMeta | null = null;
    const rawEvaluation = asRecord(body.evaluation);
    if (rawEvaluation) {
      const runId = stringValue(rawEvaluation.runId);
      const questionIndex = numberValue(rawEvaluation.questionIndex);
      if (
        !runId ||
        questionIndex === null ||
        !Number.isInteger(questionIndex) ||
        questionIndex < 0
      ) {
        return NextResponse.json({ message: "Invalid evaluation metadata" }, { status: 400 });
      }
      evaluation = { runId, questionIndex };
    }

    let question = stringValue(body.question)?.trim() ?? "";
    if (!question) {
      return NextResponse.json({ message: "A question is required" }, { status: 400 });
    }
    if (question.length > 2000) {
      return NextResponse.json({ message: "Question is too long" }, { status: 400 });
    }

    let run: RunContext | null = null;
    if (evaluation) {
      const row = await db.evaluationRun.findFirst({
        where: { id: evaluation.runId, userId: user.id },
        select: {
          id: true,
          repositoryId: true,
          status: true,
          retrievalK: true,
          judgeAnswers: true,
          questions: true,
          repository: { select: { status: true } },
        },
      });
      if (!row) {
        return NextResponse.json({ message: "Evaluation run not found" }, { status: 404 });
      }
      if (row.status !== "RUNNING") {
        return NextResponse.json(
          { message: "This evaluation run has already finished" },
          { status: 409 },
        );
      }
      if (row.repository.status !== "READY") {
        return NextResponse.json(
          { message: "The benchmark repository is not ready" },
          { status: 409 },
        );
      }
      const configured = readRunQuestion(row.questions, evaluation.questionIndex);
      if (!configured) {
        return NextResponse.json({ message: "Evaluation question not found" }, { status: 400 });
      }
      // The run, not the request body, owns the question and ground truth.
      question = configured.question;
      run = {
        id: row.id,
        repositoryId: row.repositoryId,
        retrievalK: row.retrievalK,
        judgeAnswers: row.judgeAnswers,
        question,
        expectedPaths: configured.expectedPaths,
      };
    }

    // Each question costs an LLM call plus a vector search. Benchmark runs are
    // server-created and sequential, so they get their own higher ceiling.
    const rule = run ? RATE_LIMITS.evaluationAsk : RATE_LIMITS.ask;
    const limitKey = run
      ? `ask-eval:${user.id}:${run.id}`
      : `ask:${user.id}:${clientIdentifier(request)}`;
    const limit = await checkRateLimit(limitKey, {
      limit: rule.limit,
      windowSeconds: rule.windowSeconds,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "Too many questions. Slow down a moment." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    let indexed: string[];
    let repositoryId: string | null;

    if (run) {
      indexed = [run.repositoryId];
      repositoryId = run.repositoryId;
    } else {
      // Repositories the caller asked about, intersected with what they own.
      const requested = Array.isArray(body.repositoryIds)
        ? body.repositoryIds.filter((id): id is string => typeof id === "string").slice(0, 50)
        : [];

      const owned = await db.repository.findMany({
        where: {
          userId: user.id,
          ...(requested.length > 0 ? { id: { in: requested } } : {}),
        },
        select: { id: true, status: true },
      });

      indexed = owned.filter((repo) => repo.status === "READY").map((repo) => repo.id);

      if (indexed.length === 0) {
        return NextResponse.json({
          answer:
            owned.length > 0
              ? "Those repositories have not finished indexing yet. Try again once they are ready."
              : "You have no indexed repositories yet. Add one from the Sync page first.",
          grounded: false,
          sources: [],
        });
      }
      repositoryId = indexed.length === 1 ? indexed[0]! : null;
    }

    const requestedLimit = numberValue(body.limit);
    const retrievalK = run
      ? run.retrievalK
      : typeof requestedLimit === "number"
        ? Math.min(Math.max(Math.round(requestedLimit), 1), 50)
        : 12;

    const startedAt = performance.now();
    let upstream: Response;
    try {
      upstream = await fetch(`${AI_SERVICE_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          repositoryIds: indexed,
          limit: retrievalK,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      console.error("[ask] AI service unreachable", error);
      await recordQuery({
        userId: user.id,
        repositoryId,
        evaluationRunId: run?.id ?? null,
        evalQuestionIndex: evaluation?.questionIndex ?? null,
        mode: run ? "EVALUATION" : "CHAT",
        question,
        status: "ERROR",
        answer: null,
        errorMessage: "The AI service is not responding.",
        latencyMs: Math.round(performance.now() - startedAt),
        expectedPaths: run?.expectedPaths ?? [],
        retrievalK: run?.retrievalK ?? null,
        retrievalMetrics: null,
      });
      return NextResponse.json({ message: "The AI service is not responding." }, { status: 503 });
    }

    if (!upstream.ok) {
      console.error("[ask] AI service returned", upstream.status);
      await recordQuery({
        userId: user.id,
        repositoryId,
        evaluationRunId: run?.id ?? null,
        evalQuestionIndex: evaluation?.questionIndex ?? null,
        mode: run ? "EVALUATION" : "CHAT",
        question,
        status: "ERROR",
        answer: null,
        errorMessage: "The AI service could not answer that question.",
        latencyMs: Math.round(performance.now() - startedAt),
        expectedPaths: run?.expectedPaths ?? [],
        retrievalK: run?.retrievalK ?? null,
        retrievalMetrics: null,
      });
      return NextResponse.json({ message: "Could not answer that question." }, { status: 502 });
    }

    let payload: JsonRecord;
    try {
      payload = asRecord(await upstream.json()) ?? {};
    } catch (error) {
      console.error("[ask] AI service returned invalid JSON", error);
      await recordQuery({
        userId: user.id,
        repositoryId,
        evaluationRunId: run?.id ?? null,
        evalQuestionIndex: evaluation?.questionIndex ?? null,
        mode: run ? "EVALUATION" : "CHAT",
        question,
        status: "ERROR",
        answer: null,
        errorMessage: "The AI service returned an invalid response.",
        latencyMs: Math.round(performance.now() - startedAt),
        expectedPaths: run?.expectedPaths ?? [],
        retrievalK: run?.retrievalK ?? null,
        retrievalMetrics: null,
      });
      return NextResponse.json({ message: "Could not answer that question." }, { status: 502 });
    }

    const answer = stringValue(payload.answer);
    if (!answer) {
      console.error("[ask] AI service returned no answer", payload.error ?? payload.detail);
      await recordQuery({
        userId: user.id,
        repositoryId,
        evaluationRunId: run?.id ?? null,
        evalQuestionIndex: evaluation?.questionIndex ?? null,
        mode: run ? "EVALUATION" : "CHAT",
        question,
        status: "ERROR",
        answer: null,
        errorMessage: "The AI service returned no answer.",
        latencyMs: Math.round(performance.now() - startedAt),
        expectedPaths: run?.expectedPaths ?? [],
        retrievalK: run?.retrievalK ?? null,
        retrievalMetrics: null,
      });
      return NextResponse.json({ message: "Could not answer that question." }, { status: 502 });
    }

    const latencyMs = Math.round(performance.now() - startedAt);
    const built = buildTrace(payload);
    const retrievalMetrics = run
      ? computeRetrievalMetrics(
          built.sources.map((source) => source.path),
          run.expectedPaths,
          run.retrievalK,
        )
      : null;

    const queryId = await recordQuery({
      userId: user.id,
      repositoryId,
      evaluationRunId: run?.id ?? null,
      evalQuestionIndex: evaluation?.questionIndex ?? null,
      mode: run ? "EVALUATION" : "CHAT",
      question,
      status: "SUCCESS",
      answer,
      errorMessage: null,
      latencyMs,
      built,
      expectedPaths: run?.expectedPaths ?? [],
      retrievalK: run?.retrievalK ?? null,
      retrievalMetrics,
    });

    let judge: JudgeResult | null = null;
    if (run?.judgeAnswers) {
      judge = await judgeAndStore({
        userId: user.id,
        queryId,
        question,
        answer,
        context: built.context ?? "",
      });
    }

    return NextResponse.json(
      {
        ...payload,
        queryId,
        ...(retrievalMetrics
          ? {
              evaluation: {
                retrievalK: run?.retrievalK ?? null,
                ...retrievalMetrics,
              },
            }
          : {}),
        ...(judge ? { judge } : {}),
      },
      { headers: rateLimitHeaders(limit) },
    );
  } catch (error) {
    console.error("ask error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
