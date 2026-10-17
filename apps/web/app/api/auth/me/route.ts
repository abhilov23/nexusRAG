import { NextResponse } from "next/server";
import { getCurrentUser, preferencesFrom } from "@/lib/auth/current-user";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
      preferences: preferencesFrom(user),
    });
  } catch (error) {
    console.error("me error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
