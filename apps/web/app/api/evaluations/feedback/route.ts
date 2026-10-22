import { NextResponse } from "next/server";

import { db } from "@repo/database";
import { getCurrentUser } from "@/lib/auth/current-user";
import { queryDetailSelect, serializeQueryDetail } from "@/lib/evaluations/detail";
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

    const limit = await checkRateLimit(`eval-feedback:${user.id}:${clientIdentifier(request)}`, {
      limit: RATE_LIMITS.feedback.limit,
      windowSeconds: RATE_LIMITS.feedback.windowSeconds,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "Too many feedback updates." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const body = parsed.value as { queryId?: unknown; value?: unknown };
    const queryId = typeof body.queryId === "string" ? body.queryId : "";
    const value = body.value;

    if (!queryId || (value !== -1 && value !== 0 && value !== 1)) {
      return NextResponse.json({ message: "Invalid feedback" }, { status: 400 });
    }

    const updated = await db.queryLog.updateMany({
      where: { id: queryId, userId: user.id },
      data: {
        feedback: value === 0 ? null : value,
        feedbackAt: value === 0 ? null : new Date(),
      },
    });

    if (updated.count === 0) {
      return NextResponse.json({ message: "Query not found" }, { status: 404 });
    }

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
    console.error("evaluations feedback error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
