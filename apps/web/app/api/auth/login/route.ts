import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@repo/database";

import { verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, createSession } from "@/lib/auth/session";
import { readJsonBody } from "@/lib/security/body";
import { rejectCrossOrigin } from "@/lib/security/csrf";
import {
  RATE_LIMITS,
  checkRateLimit,
  clientIdentifier,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";

export async function POST(req: Request) {
  try {
    const csrf = rejectCrossOrigin(req);
    if (csrf) return csrf;

    // Throttled per IP and per account: per-IP alone lets a botnet spread
    // guessing across many addresses, and per-account alone lets one attacker
    // lock a victim out by failing their login repeatedly.
    const byIp = await checkRateLimit(`login:ip:${clientIdentifier(req)}`, {
      limit: RATE_LIMITS.login.limit,
      windowSeconds: RATE_LIMITS.login.windowSeconds,
    });
    if (!byIp.allowed) {
      return NextResponse.json(
        { message: "Too many sign-in attempts. Try again later." },
        { status: 429, headers: rateLimitHeaders(byIp) },
      );
    }

    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;

    const { email, password } = parsed.value as { email?: unknown; password?: unknown };

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return NextResponse.json({ message: "Email and password are required" }, { status: 400 });
    }

    const normalisedEmail = email.trim().toLowerCase();

    const byAccount = await checkRateLimit(`login:acct:${normalisedEmail}`, {
      limit: RATE_LIMITS.login.limit,
      windowSeconds: RATE_LIMITS.login.windowSeconds,
    });
    if (!byAccount.allowed) {
      return NextResponse.json(
        { message: "Too many sign-in attempts. Try again later." },
        { status: 429, headers: rateLimitHeaders(byAccount) },
      );
    }

    const user = await db.user.findUnique({
      where: { email: normalisedEmail },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    const passwordValid = await verifyPassword(user.passwordHash, password);

    if (!passwordValid) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    const sessionId = await createSession(user.id);

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, sessionId, SESSION_COOKIE_OPTIONS);

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Login error:", error);

    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
