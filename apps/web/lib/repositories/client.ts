/**
 * Typed client for the ingestion API.
 *
 * Keeping this in one place means the sync page and the workspace modal cannot
 * drift on status handling, and idempotency keys are generated consistently.
 */

/** Mirrors `RepositoryStatus` in the Prisma schema. */
export type RepositoryStatus =
  "QUEUED" | "DOWNLOADING" | "UPLOADING" | "INDEXING" | "READY" | "FAILED";

export type Repository = {
  id: string;
  owner: string;
  name: string;
  githubUrl: string;
  defaultBranch: string | null;
  commitSha: string | null;
  latestSha: string | null;
  status: RepositoryStatus;
  sizeBytes: number | null;
  lastIngestedAt: string | null;
  errorMessage: string | null;
  /** Dominant chunk language measured at index time. Null until reported. */
  language: string | null;
  unchanged?: boolean;
};

export type QueueStats = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  paused: number;
  total: number;
};

export type SubmitResult = {
  repository: Repository;
};

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * A per-attempt idempotency key.
 *
 * Stable for the lifetime of one user intent (one form submit), so a retry of
 * that intent replays the original response instead of enqueueing twice.
 */
function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

async function parse<T>(response: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // A non-JSON body (a proxy error page, say) should not mask the status.
  }

  if (!response.ok) {
    const message =
      (body as { message?: string; error?: string } | null)?.message ??
      (body as { error?: string } | null)?.error ??
      `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return body as T;
}

export async function listRepositories(signal?: AbortSignal): Promise<Repository[]> {
  const response = await fetch("/api/repositories", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  const body = await parse<{ repositories: Repository[] }>(response);
  return body.repositories ?? [];
}

export async function submitRepository(
  url: string,
  idempotencyKey: string = newIdempotencyKey(),
): Promise<SubmitResult> {
  const response = await fetch("/api/repositories", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ url }),
  });
  return parse<SubmitResult>(response);
}

/** Removes a repository from the workspace. */
export async function deleteRepository(id: string): Promise<void> {
  const response = await fetch(`/api/repositories?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  await parse(response);
}

/** Minimal shape the workspace list needs to render a row. */
export type WorkspaceRow = Pick<
  Repository,
  | "id"
  | "owner"
  | "name"
  | "githubUrl"
  | "defaultBranch"
  | "status"
  | "sizeBytes"
  | "lastIngestedAt"
>;

export async function fetchQueueStats(signal?: AbortSignal): Promise<QueueStats | null> {
  const response = await fetch("/api/queue/stats", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  // A degraded queue is not a reason to fail the whole page.
  if (response.status === 503) return null;
  const body = await parse<QueueStats>(response);
  return body;
}

/** Statuses that mean work is still in flight. */
export const ACTIVE_STATUSES: RepositoryStatus[] = [
  "QUEUED",
  "DOWNLOADING",
  "UPLOADING",
  "INDEXING",
];

export function isActive(status: RepositoryStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** Human label for a status, matching the pipeline the user actually sees. */
export function statusLabel(status: RepositoryStatus): string {
  switch (status) {
    case "READY":
      return "Ready";
    case "QUEUED":
      return "Queued";
    case "DOWNLOADING":
      return "Fetching archive";
    case "UPLOADING":
      return "Uploading";
    case "INDEXING":
      return "Indexing";
    case "FAILED":
      return "Failed";
    default:
      return status;
  }
}
