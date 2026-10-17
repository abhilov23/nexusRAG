import { NextResponse } from "next/server";

import { db } from "@repo/database";
import { getCurrentUser } from "@/lib/auth/current-user";
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

export type AskSource = {
  index: number;
  repository_id: string;
  path: string;
  start_line: number;
  end_line: number;
  symbol: string | null;
  language: string;
};

export type AskResponse = {
  answer: string;
  grounded: boolean;
  sources: AskSource[];
  error?: string;
};

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

    // Each question costs an LLM call plus a vector search, so it is the most
    // expensive endpoint in the app. Keyed on the user and their address so one
    // noisy client cannot exhaust the limit for everyone behind one NAT.
    const limit = await checkRateLimit(`ask:${user.id}:${clientIdentifier(request)}`, {
      limit: RATE_LIMITS.ask.limit,
      windowSeconds: RATE_LIMITS.ask.windowSeconds,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "Too many questions. Slow down a moment." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const body = parsed.value as { question?: unknown; repositoryIds?: unknown; limit?: unknown };

    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json({ message: "A question is required" }, { status: 400 });
    }
    if (question.length > 2000) {
      return NextResponse.json({ message: "Question is too long" }, { status: 400 });
    }

    // Repositories the caller asked about, intersected with what they own.
    const requested = Array.isArray(body.repositoryIds)
      ? body.repositoryIds.filter((id): id is string => typeof id === "string").slice(0, 50)
      : [];

    const owned = await db.repository.findMany({
      where: { userId: user.id, ...(requested.length > 0 ? { id: { in: requested } } : {}) },
      select: { id: true, status: true },
    });

    const indexed = owned.filter((repo) => repo.status === "READY").map((repo) => repo.id);

    if (indexed.length === 0) {
      return NextResponse.json({
        answer:
          indexed.length === 0 && owned.length > 0
            ? "Those repositories have not finished indexing yet. Try again once they are ready."
            : "You have no indexed repositories yet. Add one from the Sync page first.",
        grounded: false,
        sources: [],
      });
    }

    let upstream: Response;
    try {
      upstream = await fetch(`${AI_SERVICE_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          repositoryIds: indexed,
          limit: typeof body.limit === "number" ? Math.min(Math.max(body.limit, 1), 50) : 12,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      console.error("[ask] AI service unreachable", error);
      return NextResponse.json({ message: "The AI service is not responding." }, { status: 503 });
    }

    if (!upstream.ok) {
      console.error("[ask] AI service returned", upstream.status);
      return NextResponse.json({ message: "Could not answer that question." }, { status: 502 });
    }

    const payload = (await upstream.json()) as AskResponse;
    return NextResponse.json(payload, { headers: rateLimitHeaders(limit) });
  } catch (error) {
    console.error("ask error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
