/** Error thrown when a submitted string is not an acceptable GitHub repository URL. */
export class InvalidRepositoryUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRepositoryUrlError";
  }
}

export type GitHubApiErrorCode =
  "NOT_FOUND" | "PRIVATE" | "RATE_LIMITED" | "UNAUTHORIZED" | "BAD_RESPONSE";

/** Error thrown when the GitHub API rejects or fails a metadata request. */
export class GitHubApiError extends Error {
  readonly code: GitHubApiErrorCode;
  readonly status: number;

  constructor(code: GitHubApiErrorCode, message: string, status: number) {
    super(message);
    this.name = "GitHubApiError";
    this.code = code;
    this.status = status;
  }
}
