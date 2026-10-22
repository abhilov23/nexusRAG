import { NextResponse } from "next/server";

import { db } from "@repo/database";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  latestPerQuestion,
  runQuerySelect,
  runSelect,
  serializeRunDetail,
} from "@/lib/evaluations/runs";
import { RATE_LIMITS, checkRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const limit = await checkRateLimit(`eval-run:${user.id}`, {
      limit: RATE_LIMITS.readQueue.limit,
      windowSeconds: RATE_LIMITS.readQueue.windowSeconds,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "Too many requests." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const { id } = await context.params;
    const run = await db.evaluationRun.findFirst({
      where: { id, userId: user.id },
      select: runSelect,
    });
    if (!run) {
      return NextResponse.json({ message: "Evaluation run not found" }, { status: 404 });
    }

    const queries = await db.queryLog.findMany({
      where: { evaluationRunId: id, userId: user.id },
      orderBy: { createdAt: "asc" },
      select: runQuerySelect,
    });

    return NextResponse.json(
      { run: serializeRunDetail(run, latestPerQuestion(queries)) },
      { headers: rateLimitHeaders(limit) },
    );
  } catch (error) {
    console.error("evaluation run GET error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
