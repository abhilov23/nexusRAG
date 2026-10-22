/**
 * Typed client for the evaluations API.
 *
 * Every call is same-origin and authenticated by the session cookie; the AI
 * service stays private behind the Next.js proxy.
 */

import type {
  BenchmarkQuestion,
  EvaluationRunStatus,
  QueryLogDetail,
  RangeKey,
  RunDetail,
  RunListItem,
  Overview,
} from "./types";

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parse<T>(response: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Proxy error pages are not JSON; the status still explains the failure.
  }

  if (!response.ok) {
    const record = body as { message?: string; error?: string; detail?: string } | null;
    throw new ApiError(
      record?.message ?? record?.error ?? record?.detail ?? `Request failed (${response.status})`,
      response.status,
    );
  }

  return body as T;
}

export async function fetchOverview(
  range: RangeKey,
  repositoryId: string | null,
  signal?: AbortSignal,
): Promise<Overview> {
  const params = new URLSearchParams({ range });
  if (repositoryId) params.set("repositoryId", repositoryId);
  const response = await fetch(`/api/evaluations/overview?${params.toString()}`, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  return parse<Overview>(response);
}

export async function fetchQuery(id: string, signal?: AbortSignal): Promise<QueryLogDetail> {
  const response = await fetch(`/api/evaluations/queries/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  const body = await parse<{ query: QueryLogDetail }>(response);
  return body.query;
}

export async function setQueryFeedback(
  queryId: string,
  value: -1 | 0 | 1,
): Promise<QueryLogDetail> {
  const response = await fetch("/api/evaluations/feedback", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ queryId, value }),
  });
  const body = await parse<{ query: QueryLogDetail }>(response);
  return body.query;
}

export async function judgeQuery(queryId: string): Promise<QueryLogDetail> {
  const response = await fetch("/api/evaluations/judge", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ queryId }),
  });
  const body = await parse<{ query: QueryLogDetail }>(response);
  return body.query;
}

export async function listRuns(signal?: AbortSignal): Promise<RunListItem[]> {
  const response = await fetch("/api/evaluations/runs", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  const body = await parse<{ runs: RunListItem[] }>(response);
  return body.runs ?? [];
}

export type CreateRunInput = {
  repositoryId: string;
  name?: string;
  retrievalK: number;
  judgeAnswers: boolean;
  questions: BenchmarkQuestion[];
};

export async function createRun(input: CreateRunInput): Promise<RunListItem> {
  const response = await fetch("/api/evaluations/runs", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  const body = await parse<{ run: RunListItem }>(response);
  return body.run;
}

export async function fetchRun(id: string, signal?: AbortSignal): Promise<RunDetail> {
  const response = await fetch(`/api/evaluations/runs/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  const body = await parse<{ run: RunDetail }>(response);
  return body.run;
}

export async function completeRun(
  id: string,
  status: Extract<EvaluationRunStatus, "COMPLETED" | "CANCELLED" | "FAILED">,
): Promise<RunDetail> {
  const response = await fetch(`/api/evaluations/runs/${encodeURIComponent(id)}/complete`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ status }),
  });
  const body = await parse<{ run: RunDetail }>(response);
  return body.run;
}
