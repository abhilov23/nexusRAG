import { cookies } from "next/headers";
import { db } from "@repo/database";
import { getSession } from "@/lib/auth/session";
import { DEFAULT_PREFERENCES, type UserPreferences } from "@/lib/auth/preferences";

export { DEFAULT_PREFERENCES };
export type { UserPreferences };

/** Merges stored JSON with defaults so a partial/legacy row never yields undefined. */
export function coercePreferences(value: unknown): UserPreferences {
  const raw = (value ?? {}) as Partial<Record<keyof UserPreferences, unknown>>;
  const bool = (key: keyof UserPreferences, fallback: boolean) =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : fallback;
  const str = (key: keyof UserPreferences, fallback: string) =>
    typeof raw[key] === "string" && raw[key] ? (raw[key] as string) : fallback;

  return {
    autoIndex: bool("autoIndex", DEFAULT_PREFERENCES.autoIndex),
    indexAlerts: bool("indexAlerts", DEFAULT_PREFERENCES.indexAlerts),
    weeklySummary: bool("weeklySummary", DEFAULT_PREFERENCES.weeklySummary),
    citations: bool("citations", DEFAULT_PREFERENCES.citations),
    defaultBranch: str("defaultBranch", DEFAULT_PREFERENCES.defaultBranch),
    workspaceName: str("workspaceName", DEFAULT_PREFERENCES.workspaceName),
    workspaceSlug: str("workspaceSlug", DEFAULT_PREFERENCES.workspaceSlug),
  };
}

/** Resolves the signed-in user from the session cookie, or null. */
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session")?.value;
  if (!sessionId) return null;

  const session = await getSession(sessionId);
  if (!session?.userId) return null;

  return db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      settings: {
        select: {
          workspaceName: true,
          workspaceSlug: true,
          defaultBranch: true,
          autoIndex: true,
          includeCitations: true,
          indexAlerts: true,
          weeklySummary: true,
        },
      },
    },
  });
}

type SettingsRow = {
  workspaceName: string;
  workspaceSlug: string;
  defaultBranch: string;
  autoIndex: boolean;
  includeCitations: boolean;
  indexAlerts: boolean;
  weeklySummary: boolean;
};

/**
 * Settings row mapped to the client-facing shape, or the documented defaults
 * when the user has never saved. `includeCitations` is stored under its DB
 * name but exposed as `citations`.
 */
export function preferencesFrom(
  row: { settings: SettingsRow | null } | null | undefined,
): UserPreferences {
  const s = row?.settings;
  if (!s) return { ...DEFAULT_PREFERENCES };
  return {
    workspaceName: s.workspaceName,
    workspaceSlug: s.workspaceSlug,
    defaultBranch: s.defaultBranch,
    autoIndex: s.autoIndex,
    citations: s.includeCitations,
    indexAlerts: s.indexAlerts,
    weeklySummary: s.weeklySummary,
  };
}
