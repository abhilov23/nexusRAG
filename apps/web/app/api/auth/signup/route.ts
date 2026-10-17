import { NextResponse } from "next/server";
import { db } from "@repo/database";
import { hashPassword } from "@/lib/auth/password";
import { readJsonBody } from "@/lib/security/body";
import { rejectCrossOrigin } from "@/lib/security/csrf";
import {
  RATE_LIMITS,
  checkRateLimit,
  clientIdentifier,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { validatePassword, isValidEmail } from "@/lib/auth/validation";

export async function POST(request: Request) {
  try {
    const csrf = rejectCrossOrigin(request);
    if (csrf) return csrf;

    const limit = await checkRateLimit(`signup:${clientIdentifier(request)}`, {
      limit: RATE_LIMITS.signup.limit,
      windowSeconds: RATE_LIMITS.signup.windowSeconds,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "Too many sign-up attempts. Try again later." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const { email, password, name } = parsed.value as {
      email?: unknown;
      password?: unknown;
      name?: unknown;
    };

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return NextResponse.json({ message: "Email and password are required" }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ message: "Invalid email format" }, { status: 400 });
    }

    // Enforced server-side as well as in the client: client checks are a
    // convenience, not a control.
    const passwordProblem = validatePassword(password);
    if (passwordProblem) {
      return NextResponse.json({ message: passwordProblem }, { status: 400 });
    }

    if (name !== undefined && name !== null && typeof name !== "string") {
      return NextResponse.json({ message: "Invalid name" }, { status: 400 });
    }

    const normalisedEmail = email.trim().toLowerCase();

    const existingUser = await db.user.findUnique({ where: { email: normalisedEmail } });
    if (existingUser) {
      return NextResponse.json(
        { message: "An account with this email already exists" },
        { status: 409 },
      );
    }

    const hashedPassword = await hashPassword(password);

    await db.user.create({
      data: {
        email: normalisedEmail,
        passwordHash: hashedPassword,
        name: typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : null,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    // Errors go to the server log only: Prisma's constraint text would leak
    // table and column names to the client.
    console.error("Signup error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
