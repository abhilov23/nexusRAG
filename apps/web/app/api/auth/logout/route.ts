import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE, deleteSession } from "@/lib/auth/session";
import { rejectCrossOrigin } from "@/lib/security/csrf";

export async function POST(request: Request) {
  try {
    // Logout is state-changing, so it gets the same origin check as everything
    // else: otherwise a third-party page could sign users out at will.
    const csrf = rejectCrossOrigin(request);
    if (csrf) return csrf;

    const cookieStore = await cookies();

    const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

    if (sessionId) {
      await deleteSession(sessionId);
    }

    cookieStore.delete(SESSION_COOKIE);

    return NextResponse.json({ message: "Logged out successfully" }, { status: 200 });
  } catch (error) {
    console.error("Logout error:", error);

    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
