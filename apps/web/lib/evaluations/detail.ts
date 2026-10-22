import type { QueryLogDetail, QueryTrace, TraceSource } from "./types";

/**
 * One select shape for every endpoint that returns a query trace. Keeping the
 * select and serializer together prevents the feedback/judge routes drifting
 * from the detail route.
 */
export const queryDetailSelect = {
  id: true,
  question: true,
  answer: true,
  status: true,
  errorMessage: true,
  mode: true,
  grounded: true,
  model: true,
  latencyMs: true,
  retrievalLatencyMs: true,
  generationLatencyMs: true,
  promptTokens: true,
  completionTokens: true,
  totalTokens: true,
  costUsd: true,
  sourceCount: true,
  sources: true,
  context: true,
  trace: true,
  expectedPaths: true,
  retrievalK: true,
  recallAtK: true,
  precisionAtK: true,
  mrr: true,
  faithfulness: true,
  relevance: true,
  judgeRationale: true,
  judgedAt: true,
  feedback: true,
  feedbackAt: true,
  createdAt: true,
  repository: { select: { id: true, owner: true, name: true } },
} as const;

export type QueryDetailRow = {
  id: string;
  question: string;
  answer: string | null;
  status: "SUCCESS" | "ERROR";
  errorMessage: string | null;
  mode: "CHAT" | "EVALUATION";
  grounded: boolean;
  model: string | null;
  latencyMs: number | null;
  retrievalLatencyMs: number | null;
  generationLatencyMs: number | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  sourceCount: number;
  sources: unknown;
  context: string | null;
  trace: unknown;
  expectedPaths: string[];
  retrievalK: number | null;
  recallAtK: number | null;
  precisionAtK: number | null;
  mrr: number | null;
  faithfulness: number | null;
  relevance: number | null;
  judgeRationale: string | null;
  judgedAt: Date | null;
  feedback: number | null;
  feedbackAt: Date | null;
  createdAt: Date;
  repository: { id: string; owner: string; name: string } | null;
};

export function serializeQueryDetail(row: QueryDetailRow): QueryLogDetail {
  return {
    ...row,
    sources: Array.isArray(row.sources) ? (row.sources as unknown as TraceSource[]) : null,
    trace:
      row.trace !== null && typeof row.trace === "object"
        ? (row.trace as unknown as QueryTrace)
        : null,
    judgedAt: row.judgedAt?.toISOString() ?? null,
    feedbackAt: row.feedbackAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
