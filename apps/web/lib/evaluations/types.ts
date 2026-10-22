/**
 * Shared shapes for RAG telemetry and evaluation runs.
 *
 * Dates cross the API as ISO strings; the server builds these objects from
 * Prisma rows so the browser never sees a raw `JsonValue`.
 */

export type RangeKey = "24h" | "7d" | "30d";
export type QueryStatus = "SUCCESS" | "ERROR";
export type QueryMode = "CHAT" | "EVALUATION";
export type EvaluationRunStatus = "RUNNING" | "COMPLETED" | "CANCELLED" | "FAILED";
export type FeedbackValue = -1 | 1;

export type TraceSource = {
  index: number;
  repository_id: string;
  path: string;
  language: string;
  symbol: string | null;
  kind: string;
  start_line: number;
  end_line: number;
  score: number;
  ranks: Record<string, number>;
  content?: string;
};

export type RetrievalTrace = {
  vector_hits: number;
  lexical_hits: number;
  fused: number;
  deduped: number;
  returned: number;
  vector_ms: number;
  lexical_ms: number;
  fusion_ms: number;
  chunks: TraceSource[];
};

export type QueryTrace = {
  model?: string;
  tokens?: { prompt: number; completion: number; total: number };
  cost_usd?: number;
  grounded?: boolean;
  timings?: {
    embed_ms: number;
    retrieval_ms: number;
    generation_ms: number;
    total_ms: number;
  };
  retrieval?: RetrievalTrace;
  context?: string;
};

export type OverviewTotals = {
  queries: number;
  succeeded: number;
  errors: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  avgCostUsd: number | null;
  feedbackUp: number;
  feedbackDown: number;
  feedbackRate: number | null;
};

export type RetrievalQuality = {
  k: number | null;
  sampleCount: number;
  recallAtK: number | null;
  precisionAtK: number | null;
  mrr: number | null;
};

export type AnswerQuality = {
  sampleCount: number;
  faithfulness: number | null;
  relevance: number | null;
};

export type OverviewBucket = {
  start: string;
  queries: number;
  errors: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  costUsd: number;
  totalTokens: number;
};

export type RecentQuery = {
  id: string;
  question: string;
  repositoryId: string | null;
  repositoryName: string | null;
  mode: QueryMode;
  status: QueryStatus;
  grounded: boolean;
  latencyMs: number | null;
  totalTokens: number;
  costUsd: number;
  sourceCount: number;
  feedback: number | null;
  createdAt: string;
  evaluationRunId: string | null;
  retrievalK: number | null;
  recallAtK: number | null;
  precisionAtK: number | null;
  mrr: number | null;
  faithfulness: number | null;
  relevance: number | null;
};

export type Overview = {
  range: RangeKey;
  since: string;
  totals: OverviewTotals;
  retrievalQuality: RetrievalQuality;
  answerQuality: AnswerQuality;
  buckets: OverviewBucket[];
  recentQueries: RecentQuery[];
};

export type QueryLogDetail = {
  id: string;
  question: string;
  answer: string | null;
  status: QueryStatus;
  errorMessage: string | null;
  mode: QueryMode;
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
  sources: TraceSource[] | null;
  context: string | null;
  trace: QueryTrace | null;
  expectedPaths: string[];
  retrievalK: number | null;
  recallAtK: number | null;
  precisionAtK: number | null;
  mrr: number | null;
  faithfulness: number | null;
  relevance: number | null;
  judgeRationale: string | null;
  judgedAt: string | null;
  feedback: number | null;
  feedbackAt: string | null;
  createdAt: string;
  repository: { id: string; owner: string; name: string } | null;
};

export type BenchmarkQuestion = {
  question: string;
  expectedPaths: string[];
};

export type RunSummary = {
  total: number;
  succeeded: number;
  errors: number;
  avgLatencyMs: number | null;
  totalTokens: number;
  costUsd: number;
  avgRecallAtK: number | null;
  avgPrecisionAtK: number | null;
  avgMrr: number | null;
  avgFaithfulness: number | null;
  avgRelevance: number | null;
};

export type RunListItem = {
  id: string;
  repositoryId: string;
  repositoryName: string;
  name: string | null;
  status: EvaluationRunStatus;
  retrievalK: number;
  judgeAnswers: boolean;
  questionCount: number;
  startedAt: string;
  completedAt: string | null;
  summary: RunSummary;
};

export type RunResult = {
  question: string;
  expectedPaths: string[];
  query: {
    id: string;
    status: QueryStatus;
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
    createdAt: string;
  } | null;
};

export type RunDetail = RunListItem & {
  questions: BenchmarkQuestion[];
  results: RunResult[];
};
