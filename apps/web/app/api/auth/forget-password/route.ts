import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { db } from "@repo/database";
import { redis } from "@repo/redis";
import { sendPasswordResetEmail } from "@/lib/email/send-password-reset";
import { readJsonBody } from "@/lib/security/body";
import { rejectCrossOrigin } from "@/lib/security/csrf";
import {
  RATE_LIMITS,
  checkRateLimit,
  clientIdentifier,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { isValidEmail } from "@/lib/auth/validation";

const RESET_TOKEN_TTL = 15 * 60; // 15 minutes

/** Identical for known and unknown addresses, so the response cannot enumerate accounts. */
const UNIFORM_RESPONSE = {
  message: "If an account exists with that email, a password reset link has been sent.",
};

export async function POST(request: Request) {
  try {
    const csrf = rejectCrossOrigin(request);
    if (csrf) return csrf;

    // Each accepted request sends an email. Without this, one caller can burn
    // the Resend quota or mail-bomb a known address.
    const limit = await checkRateLimit(`forget:${clientIdentifier(request)}`, {
      limit: RATE_LIMITS.forgetPassword.limit,
      windowSeconds: RATE_LIMITS.forgetPassword.windowSeconds,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many reset requests. Try again later." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const email = (parsed.value as { email?: unknown } | null)?.email;

    if (typeof email !== "string" || !isValidEmail(email)) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(UNIFORM_RESPONSE);
    }

    const token = crypto.randomBytes(32).toString("hex");

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await redis.set(`password-reset:${tokenHash}`, user.id, "EX", RESET_TOKEN_TTL);

    await sendPasswordResetEmail(user.email, token);

    return NextResponse.json(UNIFORM_RESPONSE);
  } catch (error) {
    console.error("Forgot password error:", error);

    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
