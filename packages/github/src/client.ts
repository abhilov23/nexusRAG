import { GitHubApiError } from "./errors.js";

const API_BASE = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 10_000;

/** A PAT is optional; without one GitHub allows only ~60 requests/hour/IP. */
function getOptionalToken(): string | undefined {
  const token = process.env.GITHUB_TOKEN;
  return token && token.trim() ? token.trim() : undefined;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "NexusRAG-Ingestion",
  };

  const token = getOptionalToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function githubRequest<T>(path: string, timeoutMs: number): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error";
    throw new GitHubApiError("BAD_RESPONSE", `GitHub request failed: ${reason}`, 502);
  }

  if (response.ok) {
    return (await response.json()) as T;
  }

  const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
  const isRateLimited =
    response.status === 429 || (response.status === 403 && rateLimitRemaining === "0");

  if (isRateLimited) {
    const reset = response.headers.get("x-ratelimit-reset");
    throw new GitHubApiError(
      "RATE_LIMITED",
      `GitHub API rate limit reached${reset ? ` (resets at ${reset})` : ""}`,
      429,
    );
  }

  if (response.status === 404) {
    // GitHub returns 404 for both missing repositories and ones we cannot see.
    throw new GitHubApiError("NOT_FOUND", "Repository not found or not publicly accessible", 404);
  }

  if (response.status === 401) {
    throw new GitHubApiError("UNAUTHORIZED", "GitHub credentials are invalid", 500);
  }

  throw new GitHubApiError("BAD_RESPONSE", `GitHub responded with ${response.status}`, 502);
}

export interface RepositoryMetadata {
  /** Full `owner/repo`. */
  fullName: string;
  owner: string;
  repo: string;
  canonicalUrl: string;
  defaultBranch: string;
  /** Repository size in KB as reported by GitHub (not the archive size). */
  sizeKb: number;
  /** Last push time, a cheap secondary change signal. */
  pushedAt: Date | null;
  isPrivate: boolean;
  isArchived: boolean;
  isFork: boolean;
  license: string | null;
  description: string | null;
}

interface RawRepository {
  full_name: string;
  name: string;
  owner: { login: string } | null;
  html_url: string;
  default_branch: string;
  size: number;
  pushed_at: string | null;
  private: boolean;
  archived: boolean;
  fork: boolean;
  description: string | null;
  license: { spdx_id?: string | null } | null;
}

export async function fetchRepositoryMetadata(
  ref: { owner: string; repo: string },
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<RepositoryMetadata> {
  const raw = await githubRequest<RawRepository>(
    `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`,
    timeoutMs,
  );

  return {
    fullName: raw.full_name,
    owner: raw.owner?.login ?? ref.owner,
    repo: raw.name,
    canonicalUrl: raw.html_url,
    defaultBranch: raw.default_branch,
    sizeKb: Number.isFinite(raw.size) ? raw.size : 0,
    pushedAt: raw.pushed_at ? new Date(raw.pushed_at) : null,
    isPrivate: Boolean(raw.private),
    isArchived: Boolean(raw.archived),
    isFork: Boolean(raw.fork),
    license: raw.license?.spdx_id ?? null,
    description: raw.description ?? null,
  };
}

/** Resolves the head commit SHA of a branch, which pins the archive. */
export async function fetchBranchHeadSha(
  ref: { owner: string; repo: string },
  branch: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const raw = await githubRequest<{ sha?: string }>(
    `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/commits/${encodeURIComponent(branch)}`,
    timeoutMs,
  );

  if (!raw.sha) {
    throw new GitHubApiError("BAD_RESPONSE", "GitHub did not return a commit SHA", 502);
  }

  return raw.sha;
}
