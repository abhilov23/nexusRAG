/**
 * Server-only helper for model-judged answer quality.
 *
 * The AI service is never exposed to the browser. This module is imported only
 * by route handlers, which enforce ownership before calling it.
 */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

export type JudgeResult = {
  faithfulness: number;
  relevance: number;
  rationale: string;
};

export class JudgeError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "JudgeError";
    this.status = status;
  }
}

function clampScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

export async function requestJudge(input: {
  question: string;
  answer: string;
  context: string;
}): Promise<JudgeResult> {
  let response: Response;
  try {
    response = await fetch(`${AI_SERVICE_URL}/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    console.error("[judge] AI service unreachable", error);
    throw new JudgeError("The AI service is not responding.", 503);
  }

  if (!response.ok) {
    let detail = "Could not judge that answer.";
    try {
      const body = (await response.json()) as {
        detail?: unknown;
        message?: unknown;
        error?: unknown;
      };
      const candidate = body.detail ?? body.message ?? body.error;
      if (typeof candidate === "string" && candidate.trim()) detail = candidate;
    } catch {
      // The status still carries the meaning.
    }
    throw new JudgeError(detail, response.status === 503 ? 503 : 502);
  }

  const payload = (await response.json()) as {
    faithfulness?: unknown;
    relevance?: unknown;
    rationale?: unknown;
  };
  const faithfulness = clampScore(payload.faithfulness);
  const relevance = clampScore(payload.relevance);
  if (faithfulness === null || relevance === null) {
    throw new JudgeError("The judge returned an invalid score.", 502);
  }

  return {
    faithfulness,
    relevance,
    rationale: typeof payload.rationale === "string" ? payload.rationale.slice(0, 2000) : "",
  };
}
