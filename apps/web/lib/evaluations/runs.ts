import { mean } from "./metrics";
import type { BenchmarkQuestion, RunDetail, RunListItem, RunResult, RunSummary } from "./types";

export const runSelect = {
  id: true,
  repositoryId: true,
  name: true,
  status: true,
  retrievalK: true,
  judgeAnswers: true,
  questions: true,
  startedAt: true,
  completedAt: true,
  repository: { select: { owner: true, name: true } },
} as const;

export const runQuerySelect = {
  id: true,
  evaluationRunId: true,
  evalQuestionIndex: true,
  status: true,
  latencyMs: true,
  totalTokens: true,
  costUsd: true,
  sourceCount: true,
  recallAtK: true,
  precisionAtK: true,
  mrr: true,
  faithfulness: true,
  relevance: true,
  errorMessage: true,
  createdAt: true,
} as const;

export type RunRow = {
  id: string;
  repositoryId: string;
  name: string | null;
  status: "RUNNING" | "COMPLETED" | "CANCELLED" | "FAILED";
  retrievalK: number;
  judgeAnswers: boolean;
  questions: unknown;
  startedAt: Date;
  completedAt: Date | null;
  repository: { owner: string; name: string };
};

export type RunQueryRow = {
  id: string;
  evaluationRunId: string | null;
  evalQuestionIndex: number | null;
  status: "SUCCESS" | "ERROR";
  latencyMs: number | null;
  totalTokens: number;
  costUsd: number;
  sourceCount: number;
  recallAtK: number | null;
  precisionAtK: number | null;
  mrr: number | null;
  faithfulness: number | null;
  relevance: number | null;
  errorMessage: string | null;
  createdAt: Date;
};

export function parseRunQuestions(value: unknown): BenchmarkQuestion[] {
  if (!Array.isArray(value)) return [];
  const questions: BenchmarkQuestion[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.question !== "string" || !record.question.trim()) continue;
    const expectedPaths = Array.isArray(record.expectedPaths)
      ? record.expectedPaths.filter(
          (path): path is string => typeof path === "string" && path.trim().length > 0,
        )
      : [];
    questions.push({
      question: record.question.trim(),
      expectedPaths: expectedPaths.slice(0, 50).map((path) => path.trim()),
    });
  }
  return questions;
}

/** A retried question can produce more than one row; the latest one wins. */
export function latestPerQuestion(rows: RunQueryRow[]): RunQueryRow[] {
  const byIndex = new Map<number, RunQueryRow>();
  for (const row of rows) {
    if (row.evalQuestionIndex === null) continue;
    const existing = byIndex.get(row.evalQuestionIndex);
    if (!existing || row.createdAt.getTime() >= existing.createdAt.getTime()) {
      byIndex.set(row.evalQuestionIndex, row);
    }
  }
  return [...byIndex.values()];
}

export function summarizeRun(rows: RunQueryRow[]): RunSummary {
  const total = rows.length;
  const succeeded = rows.filter((row) => row.status === "SUCCESS").length;
  const latencies = rows
    .map((row) => row.latencyMs)
    .filter((value): value is number => typeof value === "number");

  return {
    total,
    succeeded,
    errors: total - succeeded,
    avgLatencyMs: mean(latencies),
    totalTokens: rows.reduce((sum, row) => sum + row.totalTokens, 0),
    costUsd: rows.reduce((sum, row) => sum + row.costUsd, 0),
    avgRecallAtK: mean(
      rows.map((row) => row.recallAtK).filter((value): value is number => value !== null),
    ),
    avgPrecisionAtK: mean(
      rows.map((row) => row.precisionAtK).filter((value): value is number => value !== null),
    ),
    avgMrr: mean(rows.map((row) => row.mrr).filter((value): value is number => value !== null)),
    avgFaithfulness: mean(
      rows.map((row) => row.faithfulness).filter((value): value is number => value !== null),
    ),
    avgRelevance: mean(
      rows.map((row) => row.relevance).filter((value): value is number => value !== null),
    ),
  };
}

export function serializeRun(row: RunRow, summary: RunSummary): RunListItem {
  return {
    id: row.id,
    repositoryId: row.repositoryId,
    repositoryName: `${row.repository.owner}/${row.repository.name}`,
    name: row.name,
    status: row.status,
    retrievalK: row.retrievalK,
    judgeAnswers: row.judgeAnswers,
    questionCount: parseRunQuestions(row.questions).length,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    summary,
  };
}

export function serializeRunDetail(row: RunRow, dedupedQueries: RunQueryRow[]): RunDetail {
  const questions = parseRunQuestions(row.questions);
  const byIndex = new Map(
    dedupedQueries
      .filter((query) => query.evalQuestionIndex !== null)
      .map((query) => [query.evalQuestionIndex!, query]),
  );

  const results: RunResult[] = questions.map((question, index) => {
    const query = byIndex.get(index);
    return {
      question: question.question,
      expectedPaths: question.expectedPaths,
      query: query
        ? {
            id: query.id,
            status: query.status,
            latencyMs: query.latencyMs,
            totalTokens: query.totalTokens,
            costUsd: query.costUsd,
            sourceCount: query.sourceCount,
            recallAtK: query.recallAtK,
            precisionAtK: query.precisionAtK,
            mrr: query.mrr,
            faithfulness: query.faithfulness,
            relevance: query.relevance,
            errorMessage: query.errorMessage,
            createdAt: query.createdAt.toISOString(),
          }
        : null,
    };
  });

  return {
    ...serializeRun(row, summarizeRun(dedupedQueries)),
    questions,
    results,
  };
}
