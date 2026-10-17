import { NextResponse } from "next/server";
import { getIngestionQueueStats } from "@repo/queue";
import { getCurrentUser } from "@/lib/auth/current-user";
import { RATE_LIMITS, checkRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Ingestion queue depth, for the "your repositories" polling UI and for
 * operators watching backlog build up.
 *
 * Returns aggregate counts only. There is no per-user breakdown, because queue
 * depth is a shared-capacity signal and a per-user view would leak which
 * accounts are ingesting. Any signed-in user may read it; it carries no
 * repository content, identifiers, or error messages.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The ingestion UI polls this, so the limit exists to bound a runaway client
  // without getting in the way of a normal refresh cadence.
  const limit = await checkRateLimit(`queue-stats:${user.id}`, {
    limit: RATE_LIMITS.readQueue.limit,
    windowSeconds: RATE_LIMITS.readQueue.windowSeconds,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  try {
    const stats = await getIngestionQueueStats();
    return NextResponse.json(stats, { headers: rateLimitHeaders(limit) });
  } catch (error) {
    console.error("[api/queue/stats] failed to read queue counts", error);
    // A Redis outage should surface as 503, not as a misleading empty queue.
    return NextResponse.json({ error: "Queue unavailable" }, { status: 503 });
  }
}
