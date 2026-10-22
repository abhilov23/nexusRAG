/**
 * Redis-backed fixed-window rate limiting.
 *
 * Fixed window rather than sliding: it is one INCR plus one conditional EXPIRE,
 * needs no sorted sets, and the burst-at-the-boundary behaviour is acceptable
 * for the endpoints guarded here (login, password reset, repo submission).
 *
 * Counters live in the same Redis as sessions, which means the limit survives a
 * restart and is shared across instances -- an in-process Map would not be.
 */

import { redis } from "@repo/redis";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. Always >= 1 so callers can set Retry-After. */
  resetSeconds: number;
};

export type RateLimitRule = {
  /** Requests permitted per window. */
  limit: number;
  windowSeconds: number;
};

/**
 * Fixed-window limiter keyed by an arbitrary scope string.
 *
 * Fails open on Redis errors: a rate limiter outage should not take down the
 * product, and the endpoints behind it have their own validation.
 */
export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const bucket = Math.floor(Date.now() / (rule.windowSeconds * 1000));
  const redisKey = `ratelimit:${key}:${bucket}`;

  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, rule.windowSeconds + 1);
    }

    const ttl = await redis.ttl(redisKey);

    return {
      allowed: count <= rule.limit,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - count),
      resetSeconds: ttl > 0 ? ttl : rule.windowSeconds,
    };
  } catch {
    return {
      allowed: true,
      limit: rule.limit,
      remaining: rule.limit,
      resetSeconds: rule.windowSeconds,
    };
  }
}

/** Best-effort client identity: the first proxy-supplied address. */
export function clientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Response headers so a well-behaved client can back off instead of retrying. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
  };
  if (!result.allowed) {
    headers["Retry-After"] = String(result.resetSeconds);
  }
  return headers;
}

/**
 * Per-route policies, named rather than inlined so the limits are greppable and
 * reviewable in one place.
 */
export const RATE_LIMITS = {
  /** Password guessing. Tight because it is credential-based. */
  login: { limit: 8, windowSeconds: 15 * 60 },
  /** Account creation. */
  signup: { limit: 5, windowSeconds: 60 * 60 },
  /** Each call sends an email; this bounds Resend spend and email-bombing. */
  forgetPassword: { limit: 3, windowSeconds: 60 * 60 },
  /** Token is 256 bits so this is only a blunting measure. */
  resetPassword: { limit: 10, windowSeconds: 15 * 60 },
  /** Mints an OAuth state cookie and redirects. */
  oauthStart: { limit: 20, windowSeconds: 15 * 60 },
  /** Costs 2 outbound GitHub calls plus a queue write: the most expensive endpoint. */
  submitRepository: { limit: 20, windowSeconds: 60 * 60 },
  /** Signed-in users polling queue depth. */
  readQueue: { limit: 120, windowSeconds: 60 },
  /** Each question costs an LLM call plus a vector search. */
  ask: { limit: 30, windowSeconds: 60 },
  /**
   * Benchmark questions are already gated by a server-created run and are
   * sequential, so they need a higher ceiling than interactive chat.
   */
  evaluationAsk: { limit: 60, windowSeconds: 60 },
  /** Starting a benchmark is cheap, but each run consumes many LLM calls. */
  benchmarkStart: { limit: 20, windowSeconds: 60 * 60 },
  /** Thumbs up/down is a small write; generous but still bounded. */
  feedback: { limit: 120, windowSeconds: 60 },
  /** The judge is an LLM call of its own. */
  judge: { limit: 30, windowSeconds: 60 },
  /** Public status page: two cheap pings, but still bounded. */
  status: { limit: 60, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;
