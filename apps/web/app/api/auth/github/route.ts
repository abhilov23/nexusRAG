import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { RATE_LIMITS, checkRateLimit, clientIdentifier } from "@/lib/security/rate-limit";

function generateState(): string {
  return randomBytes(32).toString("hex");
}

export async function GET(request: Request) {
  // Each call mints a state cookie and an outbound redirect to GitHub.
  const limit = await checkRateLimit(`oauth:${clientIdentifier(request)}`, {
    limit: RATE_LIMITS.oauthStart.limit,
    windowSeconds: RATE_LIMITS.oauthStart.windowSeconds,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Too many sign-in attempts. Try again later." },
      { status: 429 },
    );
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    // Fail fast when the OAuth app is not configured, instead of letting
    // GitHub reject a malformed authorize URL.
    console.error("GITHUB_CLIENT_ID is not configured");
    return NextResponse.json({ message: "GitHub sign-in is not configured" }, { status: 503 });
  }

  const state = generateState();

  const cookieStore = await cookies();

  cookieStore.set("github_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/github/callback`,
    scope: "read:user user:email",
    state,
  });

  return NextResponse.redirect(`https://github.com/login/oauth/authorize?${params}`);
}
