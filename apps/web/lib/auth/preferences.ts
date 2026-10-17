/**
 * Preference shape and defaults shared by the client and the API routes.
 * Intentionally free of server-only imports (next/headers, prisma) so client
 * components can import it safely.
 */
export type UserPreferences = {
  autoIndex: boolean;
  indexAlerts: boolean;
  weeklySummary: boolean;
  citations: boolean;
  defaultBranch: string;
  workspaceName: string;
  workspaceSlug: string;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  autoIndex: true,
  indexAlerts: true,
  weeklySummary: false,
  citations: true,
  defaultBranch: "main",
  workspaceName: "Nexus Labs",
  workspaceSlug: "nexus-labs",
};
