import { NextResponse } from "next/server";
import { db } from "@repo/database";
import { getCurrentUser, preferencesFrom } from "@/lib/auth/current-user";
import type { UserPreferences } from "@/lib/auth/preferences";

const BRANCHES = new Set(["main", "develop", "release"]);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json()) as Partial<UserPreferences> & {
      name?: string | null;
    };

    const current = preferencesFrom(user);
    const next: UserPreferences = { ...current };

    if (typeof body.autoIndex === "boolean") next.autoIndex = body.autoIndex;
    if (typeof body.indexAlerts === "boolean") next.indexAlerts = body.indexAlerts;
    if (typeof body.weeklySummary === "boolean") next.weeklySummary = body.weeklySummary;
    if (typeof body.citations === "boolean") next.citations = body.citations;
    if (typeof body.defaultBranch === "string" && BRANCHES.has(body.defaultBranch)) {
      next.defaultBranch = body.defaultBranch;
    }
    if (typeof body.workspaceName === "string" && body.workspaceName.trim()) {
      next.workspaceName = body.workspaceName.trim().slice(0, 60);
    }
    if (typeof body.workspaceSlug === "string" && SLUG_RE.test(body.workspaceSlug)) {
      next.workspaceSlug = body.workspaceSlug;
    }

    // Typed 1:1 row, created on first write.
    await db.userSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        workspaceName: next.workspaceName,
        workspaceSlug: next.workspaceSlug,
        defaultBranch: next.defaultBranch,
        autoIndex: next.autoIndex,
        includeCitations: next.citations,
        indexAlerts: next.indexAlerts,
        weeklySummary: next.weeklySummary,
      },
      update: {
        workspaceName: next.workspaceName,
        workspaceSlug: next.workspaceSlug,
        defaultBranch: next.defaultBranch,
        autoIndex: next.autoIndex,
        includeCitations: next.citations,
        indexAlerts: next.indexAlerts,
        weeklySummary: next.weeklySummary,
      },
    });

    let name = user.name;
    if (typeof body.name === "string") {
      const trimmed = body.name.trim().slice(0, 80) || null;
      await db.user.update({ where: { id: user.id }, data: { name: trimmed } });
      name = trimmed;
    }

    // Respond with the values just written; `user` was read before the upsert.
    return NextResponse.json({
      user: { id: user.id, email: user.email, name },
      preferences: next,
    });
  } catch (error) {
    console.error("preferences error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
