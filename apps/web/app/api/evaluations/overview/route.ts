import { NextResponse } from "next/server";

import { db } from "@repo/database";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mean, percentile } from "@/lib/evaluations/metrics";
import type { Overview, OverviewBucket, RangeKey, RecentQuery } from "@/lib/evaluations/types";
import { RATE_LIMITS, checkRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const RANGES: Record<RangeKey, { ms: number; bucketMs: number; buckets: number }> = {
  "24h": { ms: 24 * 60 * 60 * 1000, bucketMs: 60 * 60 * 1000, buckets: 24 },
  "7d": { ms: 7 * 24 * 60 * 60 * 1000, bucketMs: 24 * 60 * 60 * 1000, buckets: 7 },
  "30d": { ms: 30 * 24 * 60 * 60 * 1000, bucketMs: 24 * 60 * 60 * 1000, buckets: 30 },
};

const SAMPLE_LIMIT = 10_000;

function parseRange(value: string | null): RangeKey {
  return value === "24h" || value === "7d" || value === "30d" ? value : "7d";
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function numeric(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function buildBuckets(
  rows: {
    status: string;
    latencyMs: number | null;
    costUsd: number;
    totalTokens: number;
    createdAt: Date;
  }[],
  startMs: number,
  bucketMs: number,
  bucketCount: number,
): OverviewBucket[] {
  const buckets = Array.from({ length: bucketCount }, () => ({
    latencies: [] as number[],
    queries: 0,
    errors: 0,
    costUsd: 0,
    totalTokens: 0,
  }));

  for (const row of rows) {
    const index = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((row.createdAt.getTime() - startMs) / bucketMs)),
    );
    const bucket = buckets[index];
    if (!bucket) continue;
    bucket.queries += 1;
    if (row.status === "ERROR") bucket.errors += 1;
    if (numeric(row.latencyMs)) bucket.latencies.push(row.latencyMs);
    bucket.costUsd += row.costUsd;
    bucket.totalTokens += row.totalTokens;
  }

  return buckets.map((bucket, index) => ({
    start: new Date(startMs + index * bucketMs).toISOString(),
    queries: bucket.queries,
    errors: bucket.errors,
    avgLatencyMs: mean(bucket.latencies),
    p95LatencyMs: percentile(bucket.latencies, 95),
    costUsd: bucket.costUsd,
    totalTokens: bucket.totalTokens,
  }));
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const limit = await checkRateLimit(`eval-overview:${user.id}`, {
      limit: RATE_LIMITS.readQueue.limit,
      windowSeconds: RATE_LIMITS.readQueue.windowSeconds,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "Too many requests." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const params = new URL(request.url).searchParams;
    const range = parseRange(params.get("range"));
    const repositoryId = params.get("repositoryId")?.trim() || null;
    const config = RANGES[range];

    const now = Date.now();
    const startMs = now - config.ms;
    const since = new Date(startMs);
    const where = {
      userId: user.id,
      createdAt: { gte: since },
      ...(repositoryId ? { repositoryId } : {}),
    };

    const [rows, recentRows] = await Promise.all([
      db.queryLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: SAMPLE_LIMIT,
        select: {
          id: true,
          status: true,
          latencyMs: true,
          totalTokens: true,
          promptTokens: true,
          completionTokens: true,
          costUsd: true,
          feedback: true,
          retrievalK: true,
          recallAtK: true,
          precisionAtK: true,
          mrr: true,
          faithfulness: true,
          relevance: true,
          createdAt: true,
        },
      }),
      db.queryLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          question: true,
          repositoryId: true,
          mode: true,
          status: true,
          grounded: true,
          latencyMs: true,
          totalTokens: true,
          costUsd: true,
          sourceCount: true,
          feedback: true,
          createdAt: true,
          evaluationRunId: true,
          retrievalK: true,
          recallAtK: true,
          precisionAtK: true,
          mrr: true,
          faithfulness: true,
          relevance: true,
          repository: { select: { owner: true, name: true } },
        },
      }),
    ]);

    const succeeded = rows.filter((row) => row.status === "SUCCESS").length;
    const errors = rows.length - succeeded;
    const latencies = rows
      .map((row) => row.latencyMs)
      .filter((value): value is number => numeric(value));
    const feedbackUp = rows.filter((row) => row.feedback === 1).length;
    const feedbackDown = rows.filter((row) => row.feedback === -1).length;
    const feedbackCount = feedbackUp + feedbackDown;

    const labelled = rows.filter(
      (row) =>
        row.retrievalK !== null &&
        row.recallAtK !== null &&
        row.precisionAtK !== null &&
        row.mrr !== null,
    );

    const byK = new Map<number, typeof labelled>();
    for (const row of labelled) {
      const k = row.retrievalK!;
      const group = byK.get(k) ?? [];
      group.push(row);
      byK.set(k, group);
    }
    const rankedGroups = [...byK.entries()].sort((a, b) => b[1].length - a[1].length);
    const chosen = rankedGroups[0] ?? null;
    const retrievalSample = chosen?.[1] ?? [];

    const judged = rows.filter((row) => row.faithfulness !== null && row.relevance !== null);

    const totalCostUsd = sum(rows.map((row) => row.costUsd));
    const totalTokens = sum(rows.map((row) => row.totalTokens));

    const overview: Overview = {
      range,
      since: since.toISOString(),
      totals: {
        queries: rows.length,
        succeeded,
        errors,
        successRate: rows.length > 0 ? succeeded / rows.length : null,
        avgLatencyMs: mean(latencies),
        p95LatencyMs: percentile(latencies, 95),
        promptTokens: sum(rows.map((row) => row.promptTokens)),
        completionTokens: sum(rows.map((row) => row.completionTokens)),
        totalTokens,
        totalCostUsd,
        avgCostUsd: rows.length > 0 ? totalCostUsd / rows.length : null,
        feedbackUp,
        feedbackDown,
        feedbackRate: feedbackCount > 0 ? feedbackUp / feedbackCount : null,
      },
      retrievalQuality: {
        k: chosen?.[0] ?? null,
        sampleCount: retrievalSample.length,
        recallAtK: mean(
          retrievalSample
            .map((row) => row.recallAtK)
            .filter((value): value is number => numeric(value)),
        ),
        precisionAtK: mean(
          retrievalSample
            .map((row) => row.precisionAtK)
            .filter((value): value is number => numeric(value)),
        ),
        mrr: mean(
          retrievalSample.map((row) => row.mrr).filter((value): value is number => numeric(value)),
        ),
      },
      answerQuality: {
        sampleCount: judged.length,
        faithfulness: mean(
          judged.map((row) => row.faithfulness).filter((value): value is number => numeric(value)),
        ),
        relevance: mean(
          judged.map((row) => row.relevance).filter((value): value is number => numeric(value)),
        ),
      },
      buckets: buildBuckets(rows, startMs, config.bucketMs, config.buckets),
      recentQueries: recentRows.map((row): RecentQuery => ({
        id: row.id,
        question: row.question,
        repositoryId: row.repositoryId,
        repositoryName: row.repository ? `${row.repository.owner}/${row.repository.name}` : null,
        mode: row.mode,
        status: row.status,
        grounded: row.grounded,
        latencyMs: row.latencyMs,
        totalTokens: row.totalTokens,
        costUsd: row.costUsd,
        sourceCount: row.sourceCount,
        feedback: row.feedback,
        createdAt: row.createdAt.toISOString(),
        evaluationRunId: row.evaluationRunId,
        retrievalK: row.retrievalK,
        recallAtK: row.recallAtK,
        precisionAtK: row.precisionAtK,
        mrr: row.mrr,
        faithfulness: row.faithfulness,
        relevance: row.relevance,
      })),
    };

    return NextResponse.json(overview, { headers: rateLimitHeaders(limit) });
  } catch (error) {
    console.error("evaluations overview error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
