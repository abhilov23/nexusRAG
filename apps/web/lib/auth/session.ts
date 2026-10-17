import { createHash, randomBytes } from "node:crypto";

import { redis } from "@repo/redis";

/** Seven days, in seconds. Used for both the Redis TTL and the cookie. */
export const SESSION_TTL = 60 * 60 * 24 * 7;

export const SESSION_COOKIE = "session";

/** Single source of truth for the session cookie, shared by every auth route. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_TTL,
} as const;

export type Session = {
  userId: string;
  createdAt: number;
};

/** 256 bits of entropy, URL-safe. */
function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Redis stores a hash of the token, not the token itself, so a leaked dump or
 * backup cannot be replayed as a session. A plain SHA-256 is enough here: the
 * input already has 256 bits of entropy, so it is not brute-forceable.
 */
function sessionKey(sessionId: string): string {
  return `session:${createHash("sha256").update(sessionId).digest("hex")}`;
}

export async function createSession(userId: string): Promise<string> {
  const sessionId = generateSessionId();
  const session: Session = { userId, createdAt: Date.now() };

  await redis.set(sessionKey(sessionId), JSON.stringify(session), "EX", SESSION_TTL);

  return sessionId;
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const sessionData = await redis.get(sessionKey(sessionId));

  if (!sessionData) {
    return null;
  }

  try {
    const parsed = JSON.parse(sessionData) as Session;
    // A record without a usable userId is unusable as a session; treat it as
    // absent rather than letting it fail somewhere deeper in the request.
    if (!parsed || typeof parsed.userId !== "string" || parsed.userId.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    // Corrupt or foreign value under this key. Drop it so it cannot keep
    // throwing on every request for this user.
    await redis.del(sessionKey(sessionId));
    return null;
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  await redis.del(sessionKey(sessionId));
}
