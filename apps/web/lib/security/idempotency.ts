/**
 * Idempotency for client-retried mutations.
 *
 * A user double-clicking "Add repository", or a mobile client retrying a request
 * whose response was lost, would otherwise enqueue duplicate ingestion jobs.
 *
 * BullMQ already de-duplicates on `{repositoryId}-{commitSha}`, but that only
 * helps once the commit SHA is known -- two submissions for a brand-new
 * repository both resolve to "no existing record" and both enqueue. The
 * Idempotency-Key closes that window.
 *
 * The first response for a key is cached in Redis and replayed verbatim, so a
 * retry returns the same repository id rather than creating a second row.
 */

import { createHash } from "node:crypto";

import { redis } from "@repo/redis";

/** How long a replayed response stays available. */
const IDEMPOTENCY_TTL = 24 * 60 * 60;

export type IdempotentRecord = {
  status: number;
  body: unknown;
};

function redisKey(scope: string, userId: string, key: string): string {
  // Hash so an arbitrary client-supplied key cannot bloat the keyspace or
  // smuggle control characters into it.
  const digest = createHash("sha256").update(`${scope}:${userId}:${key}`).digest("hex");
  return `idempotency:${digest}`;
}

/** Valid Idempotency-Key shape: 16-128 printable, non-space characters. */
const KEY_RE = /^[\x21-\x7e]{16,128}$/;

/**
 * Structurally typed for the same reason as the CSRF check: a real `Request`
 * cannot be given an `Idempotency-Key` header in a unit test without the fetch
 * layer fighting it.
 */
export function parseIdempotencyKey(request: {
  headers: { get(name: string): string | null };
}): string | null {
  const raw = request.headers.get("idempotency-key");
  if (!raw) return null;
  const trimmed = raw.trim();
  return KEY_RE.test(trimmed) ? trimmed : null;
}

/**
 * Look up a previously-stored response for this key.
 *
 * `IN_PROGRESS` means a concurrent request with the same key is still running,
 * so replaying anything would be wrong.
 */
export async function lookupIdempotent(
  scope: string,
  userId: string,
  key: string,
): Promise<IdempotentRecord | "IN_PROGRESS" | null> {
  const raw = await redis.get(redisKey(scope, userId, key));
  if (!raw) return null;
  if (raw === "IN_PROGRESS") return "IN_PROGRESS";
  try {
    return JSON.parse(raw) as IdempotentRecord;
  } catch {
    return null;
  }
}

/**
 * Claim the key. Returns false when another request already holds it, which the
 * caller should surface as 409 rather than processing twice.
 */
export async function claimIdempotentKey(
  scope: string,
  userId: string,
  key: string,
): Promise<boolean> {
  const stored = await redis.set(
    redisKey(scope, userId, key),
    "IN_PROGRESS",
    "EX",
    IDEMPOTENCY_TTL,
    "NX",
  );
  return stored === "OK";
}

export async function storeIdempotentResult(
  scope: string,
  userId: string,
  key: string,
  record: IdempotentRecord,
): Promise<void> {
  await redis.set(redisKey(scope, userId, key), JSON.stringify(record), "EX", IDEMPOTENCY_TTL);
}

/** Release a claim without recording a result, so a failed attempt can be retried. */
export async function releaseIdempotentKey(
  scope: string,
  userId: string,
  key: string,
): Promise<void> {
  await redis.del(redisKey(scope, userId, key));
}
