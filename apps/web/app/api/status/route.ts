import { NextResponse } from "next/server";
import { db } from "@repo/database";
import { redis } from "@repo/redis";
import {
  RATE_LIMITS,
  checkRateLimit,
  clientIdentifier,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Public liveness endpoint (no session required -- status pages are public by
 * convention). Pings the two backing stores with a tight timeout and reports
 * per-service health plus latency, so the landing page can show live status
 * instead of a static badge.
 */
async function timed<T>(
  fn: () => Promise<T>,
  timeoutMs = 2500,
): Promise<{ ok: boolean; ms: number }> {
  const started = performance.now();
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    return { ok: true, ms: Math.round(performance.now() - started) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - started) };
  }
}

export async function GET(request: Request) {
  const limit = await checkRateLimit(`status:${clientIdentifier(request)}`, RATE_LIMITS.status);
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  const [database, cache] = await Promise.all([
    timed(() => db.$queryRaw`SELECT 1`),
    timed(() => redis.ping()),
  ]);
  const ok = database.ok && cache.ok;

  return NextResponse.json(
    {
      ok,
      time: new Date().toISOString(),
      services: { database, cache },
    },
    { headers: { "Cache-Control": "no-store", ...rateLimitHeaders(limit) } },
  );
}
