import { NextResponse } from "next/server";

import { db } from "@repo/database";
import { getCurrentUser } from "@/lib/auth/current-user";
import { queryDetailSelect, serializeQueryDetail } from "@/lib/evaluations/detail";
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

    const limit = await checkRateLimit(`eval-query:${user.id}`, {
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
    const row = await db.queryLog.findFirst({
      where: { id, userId: user.id },
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
    console.error("evaluation query GET error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
