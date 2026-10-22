import { NextResponse } from "next/server";

import { db } from "@repo/database";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  latestPerQuestion,
  runQuerySelect,
  runSelect,
  serializeRunDetail,
} from "@/lib/evaluations/runs";
import { readJsonBody } from "@/lib/security/body";
import { rejectCrossOrigin } from "@/lib/security/csrf";
import {
  RATE_LIMITS,
  checkRateLimit,
  clientIdentifier,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const FINAL_STATUSES = ["COMPLETED", "CANCELLED", "FAILED"] as const;
type FinalStatus = (typeof FINAL_STATUSES)[number];

function isFinalStatus(value: unknown): value is FinalStatus {
  return typeof value === "string" && (FINAL_STATUSES as readonly string[]).includes(value);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const csrf = rejectCrossOrigin(request);
    if (csrf) return csrf;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const limit = await checkRateLimit(
      `eval-run-complete:${user.id}:${clientIdentifier(request)}`,
      {
        limit: RATE_LIMITS.feedback.limit,
        windowSeconds: RATE_LIMITS.feedback.windowSeconds,
      },
    );
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "Too many requests." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const status = (parsed.value as { status?: unknown }).status;
    if (!isFinalStatus(status)) {
      return NextResponse.json({ message: "Invalid run status" }, { status: 400 });
    }

    const { id } = await context.params;
    const updated = await db.evaluationRun.updateMany({
      where: { id, userId: user.id, status: "RUNNING" },
      data: { status, completedAt: new Date() },
    });

    if (updated.count === 0) {
      const existing = await db.evaluationRun.findFirst({
        where: { id, userId: user.id },
        select: { id: true, status: true },
      });
      if (!existing) {
        return NextResponse.json({ message: "Evaluation run not found" }, { status: 404 });
      }
      return NextResponse.json(
        { message: "This evaluation run has already finished" },
        { status: 409 },
      );
    }

    const [run, queries] = await Promise.all([
      db.evaluationRun.findFirst({
        where: { id, userId: user.id },
        select: runSelect,
      }),
      db.queryLog.findMany({
        where: { evaluationRunId: id, userId: user.id },
        orderBy: { createdAt: "asc" },
        select: runQuerySelect,
      }),
    ]);

    if (!run) {
      return NextResponse.json({ message: "Evaluation run not found" }, { status: 404 });
    }

    return NextResponse.json(
      { run: serializeRunDetail(run, latestPerQuestion(queries)) },
      { headers: rateLimitHeaders(limit) },
    );
  } catch (error) {
    console.error("evaluation run complete error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
