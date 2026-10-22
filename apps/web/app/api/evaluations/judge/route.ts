import { NextResponse } from "next/server";

import { db } from "@repo/database";
import { getCurrentUser } from "@/lib/auth/current-user";
import { queryDetailSelect, serializeQueryDetail } from "@/lib/evaluations/detail";
import { JudgeError, requestJudge } from "@/lib/evaluations/judge";
import { readJsonBody } from "@/lib/security/body";
import { rejectCrossOrigin } from "@/lib/security/csrf";
import {
  RATE_LIMITS,
  checkRateLimit,
  clientIdentifier,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const csrf = rejectCrossOrigin(request);
    if (csrf) return csrf;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const limit = await checkRateLimit(`eval-judge:${user.id}:${clientIdentifier(request)}`, {
      limit: RATE_LIMITS.judge.limit,
      windowSeconds: RATE_LIMITS.judge.windowSeconds,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "Too many judge requests. Slow down a moment." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const queryId = (parsed.value as { queryId?: unknown }).queryId;
    if (typeof queryId !== "string" || !queryId) {
      return NextResponse.json({ message: "A query id is required" }, { status: 400 });
    }

    const existing = await db.queryLog.findFirst({
      where: { id: queryId, userId: user.id },
      select: { id: true, question: true, answer: true, context: true },
    });
    if (!existing) {
      return NextResponse.json({ message: "Query not found" }, { status: 404 });
    }
    if (!existing.answer) {
      return NextResponse.json({ message: "This query has no answer to judge" }, { status: 400 });
    }
    if (!existing.context) {
      return NextResponse.json(
        { message: "This query has no stored context to judge against" },
        { status: 400 },
      );
    }

    const result = await requestJudge({
      question: existing.question,
      answer: existing.answer,
      context: existing.context,
    });

    await db.queryLog.updateMany({
      where: { id: queryId, userId: user.id },
      data: {
        faithfulness: result.faithfulness,
        relevance: result.relevance,
        judgeRationale: result.rationale,
        judgedAt: new Date(),
      },
    });

    const row = await db.queryLog.findFirst({
      where: { id: queryId, userId: user.id },
      select: queryDetailSelect,
    });
    if (!row) {
      return NextResponse.json({ message: "Query not found" }, { status: 404 });
    }

    return NextResponse.json(
      { query: serializeQueryDetail(row) },
      { headers: rateLimitHeaders(limit) },
    );
  } catch (error) {
    if (error instanceof JudgeError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    console.error("evaluations judge error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
