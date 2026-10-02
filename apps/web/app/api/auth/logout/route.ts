import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { deleteSession } from "@/lib/auth/session";

export async function POST() {
  try {
    const cookieStore = await cookies();

    const sessionId = cookieStore.get("session")?.value;

    // Delete server-side session if one exists
    if (sessionId) {
      await deleteSession(sessionId);
    }
    
    // delete browser cookie
    cookieStore.delete("session");

    return NextResponse.json(
      { message: "Logged out successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Logout error:", error);

    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}