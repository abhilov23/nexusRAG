// app/api/auth/reset-password/route.ts

import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { db } from "@repo/database";
import { redis } from "@repo/redis";
import { hashPassword } from "@/lib/auth/password";
import { validatePassword } from "@/lib/auth/validation";
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

    const limit = await checkRateLimit(`reset:${clientIdentifier(req)}`, {
      limit: RATE_LIMITS.resetPassword.limit,
      windowSeconds: RATE_LIMITS.resetPassword.windowSeconds,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many reset attempts. Try again later." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;

    const { token, newPassword } = parsed.value as {
      token?: unknown;
      newPassword?: unknown;
    };

    if (typeof token !== "string" || typeof newPassword !== "string" || !token || !newPassword) {
      return NextResponse.json({ error: "Token and password are required" }, { status: 400 });
    }

    // Enforced here as well as in the client form.
    const passwordProblem = validatePassword(newPassword);
    if (passwordProblem) {
      return NextResponse.json({ error: passwordProblem }, { status: 400 });
    }

    // 1. Hash the received token
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const key = `password-reset:${tokenHash}`;

    // 2. Check Redis
    const userId = await redis.get(key);

    if (!userId) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
    }

    // 3. Hash the new password
    const passwordHash = await hashPassword(newPassword);

    // 4. Update PostgreSQL
    await db.user.update({ where: { id: userId }, data: { passwordHash } });

    // 5. Consume the reset token
    await redis.del(key);

    return NextResponse.json({ message: "Password reset successfully" });
  } catch (error) {
    // The token has already been validated by this point; anything here is a
    // server fault, so log it and return a generic message.
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
