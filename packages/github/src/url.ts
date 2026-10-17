import { InvalidRepositoryUrlError } from "./errors.js";

export interface RepositoryRef {
  owner: string;
  /** Repository name with any `.git` suffix removed. */
  repo: string;
  /** Canonical `https://github.com/owner/repo` form. */
  canonicalUrl: string;
}

const GITHUB_HOSTNAMES = new Set(["github.com", "www.github.com"]);

/** GitHub usernames/orgs: alphanumerics, hyphens, underscores, dots. */
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

const MAX_OWNER_LENGTH = 39;
const MAX_REPO_LENGTH = 100;

/**
 * First path segments that are GitHub product routes rather than a user.
 * Submitting one of these is always a mistake, so we reject rather than guess.
 */
const RESERVED_OWNERS = new Set([
  "about",
  "account",
  "apps",
  "blog",
  "business",
  "codespaces",
  "collections",
  "contact",
  "customer-stories",
  "dashboard",
  "enterprise",
  "events",
  "explore",
  "features",
  "gist",
  "github",
  "home",
  "issues",
  "join",
  "login",
  "logout",
  "marketplace",
  "new",
  "notifications",
  "organizations",
  "orgs",
  "pricing",
  "pulls",
  "search",
  "security",
  "sessions",
  "settings",
  "signup",
  "sponsors",
  "stars",
  "topics",
  "trending",
  "users",
  "watching",
]);

/** Repository names GitHub reserves at the top level of every account. */
const RESERVED_REPOS = new Set([
  "about",
  "actions",
  "apps",
  "blog",
  "collections",
  "contact",
  "customer-stories",
  "dashboard",
  "enterprise",
  "events",
  "explore",
  "features",
  "home",
  "issues",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "pricing",
  "pulls",
  "search",
  "security",
  "settings",
  "sponsors",
  "stars",
  "topics",
  "trending",
  "users",
]);

/** Git commit SHAs are 40 hex chars (SHA-1) or 64 (SHA-256). */
const COMMIT_SHA_RE = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/i;

function assertValidSegment(value: string, label: string, maxLength: number): void {
  if (!value) {
    throw new InvalidRepositoryUrlError(`Missing ${label} in GitHub URL`);
  }
  if (value.length > maxLength) {
    throw new InvalidRepositoryUrlError(`Invalid ${label} in GitHub URL`);
  }
  if (!SEGMENT_RE.test(value)) {
    throw new InvalidRepositoryUrlError(`Invalid ${label} in GitHub URL`);
  }
  // Leading/trailing separators and dot-segments are never valid and are the
  // usual shape of a traversal attempt, even though URL parsing normalises them.
  if (
    value.startsWith(".") ||
    value.endsWith(".") ||
    value.startsWith("-") ||
    value.endsWith("-")
  ) {
    throw new InvalidRepositoryUrlError(`Invalid ${label} in GitHub URL`);
  }
  if (value.includes("..")) {
    throw new InvalidRepositoryUrlError(`Invalid ${label} in GitHub URL`);
  }
}

/**
 * Validates and normalises a user-supplied GitHub repository URL.
 *
 * Accepts the shapes users actually paste:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/
 *   https://github.com/owner/repo.git
 *
 * Everything else is rejected. The returned `owner`/`repo` are the only values
 * ever used to build outbound URLs, so a hostile input can never reach fetch().
 */
export function parseGitHubRepositoryUrl(input: unknown): RepositoryRef {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new InvalidRepositoryUrlError("A GitHub repository URL is required");
  }

  const raw = input.trim();
  if (raw.length > 300) {
    throw new InvalidRepositoryUrlError("GitHub URL is too long");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidRepositoryUrlError("Malformed GitHub URL");
  }

  if (url.protocol !== "https:") {
    throw new InvalidRepositoryUrlError("GitHub URL must use HTTPS");
  }

  if (!GITHUB_HOSTNAMES.has(url.hostname.toLowerCase())) {
    throw new InvalidRepositoryUrlError("Only github.com repository URLs are supported");
  }

  if (url.search || url.hash) {
    throw new InvalidRepositoryUrlError("GitHub URL must not contain a query string or fragment");
  }

  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);

  if (segments.length !== 2) {
    throw new InvalidRepositoryUrlError(
      "Expected a github.com URL in the form https://github.com/owner/repository",
    );
  }

  const owner = segments[0]!;
  const repoWithSuffix = segments[1]!;
  const repo = repoWithSuffix.endsWith(".git")
    ? repoWithSuffix.slice(0, -".git".length)
    : repoWithSuffix;

  assertValidSegment(owner, "owner", MAX_OWNER_LENGTH);
  assertValidSegment(repo, "repository name", MAX_REPO_LENGTH);

  if (RESERVED_OWNERS.has(owner.toLowerCase())) {
    throw new InvalidRepositoryUrlError("That GitHub URL is not a user or organisation");
  }
  if (RESERVED_REPOS.has(repo.toLowerCase())) {
    throw new InvalidRepositoryUrlError("That GitHub URL is not a repository");
  }

  return {
    owner,
    repo,
    canonicalUrl: `https://github.com/${owner}/${repo}`,
  };
}

/**
 * Archive URL for an exact commit.
 *
 * Built only from already-validated segments, so no user-controlled path can
 * escape to another host or path.
 */
export function buildArchiveUrl(ref: { owner: string; repo: string; commitSha: string }): string {
  assertValidSegment(ref.owner, "owner", MAX_OWNER_LENGTH);
  assertValidSegment(ref.repo, "repository name", MAX_REPO_LENGTH);

  // A commit SHA is stricter than a generic path segment: it must be hex.
  if (!COMMIT_SHA_RE.test(ref.commitSha)) {
    throw new InvalidRepositoryUrlError("Invalid commit sha");
  }

  return `https://github.com/${ref.owner}/${ref.repo}/archive/${ref.commitSha}.tar.gz`;
}
