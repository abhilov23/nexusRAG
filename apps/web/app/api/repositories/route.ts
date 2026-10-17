import { NextResponse } from "next/server";

import { db } from "@repo/database";
import {
  GitHubApiError,
  InvalidRepositoryUrlError,
  fetchBranchHeadSha,
  fetchRepositoryMetadata,
  parseGitHubRepositoryUrl,
} from "@repo/github";
import { getRepositoryIngestionQueue, repositoryIngestionJobId } from "@repo/queue";
import { deleteArchive } from "@repo/storage";
import { getCurrentUser } from "@/lib/auth/current-user";
import { readJsonBody } from "@/lib/security/body";
import { rejectCrossOrigin } from "@/lib/security/csrf";
import {
  claimIdempotentKey,
  lookupIdempotent,
  parseIdempotencyKey,
  releaseIdempotentKey,
  storeIdempotentResult,
} from "@/lib/security/idempotency";
import {
  RATE_LIMITS,
  checkRateLimit,
  clientIdentifier,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";

const IDEMPOTENCY_SCOPE = "submit-repository";

/** Ceiling on repositories per account, to bound queue and storage growth. */
const MAX_REPOSITORIES_PER_USER = 200;

/**
 * Client-facing messages for upstream GitHub failures.
 *
 * The raw error can name internal hosts, carry the rate-limit reset epoch, or
 * reveal that the server's GitHub credentials are broken. Those belong in logs,
 * not in a response body.
 */
function publicGitHubMessage(code: GitHubApiError["code"]): string {
  switch (code) {
    case "NOT_FOUND":
      return "Repository not found. Only public GitHub repositories are supported.";
    case "RATE_LIMITED":
      return "GitHub is rate limiting us right now. Try again shortly.";
    case "UNAUTHORIZED":
      return "GitHub rejected our credentials. This is a server configuration problem.";
    case "BAD_RESPONSE":
      return "GitHub returned an unexpected response.";
    default:
      return "Could not reach GitHub.";
  }
}

/** The shape returned to clients; deliberately omits internal storage details. */
function publicRepository(row: {
  id: string;
  owner: string;
  name: string;
  githubUrl: string;
  defaultBranch: string | null;
  commitSha: string | null;
  latestSha: string | null;
  status: string;
  sizeBytes: number | null;
  lastIngestedAt: Date | null;
  errorMessage: string | null;
}) {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    githubUrl: row.githubUrl,
    defaultBranch: row.defaultBranch,
    commitSha: row.commitSha,
    latestSha: row.latestSha,
    status: row.status,
    sizeBytes: row.sizeBytes,
    lastIngestedAt: row.lastIngestedAt,
    // The worker already redacts credentials out of this before persisting.
    errorMessage: row.errorMessage,
  };
}

/**
 * Submits a public GitHub repository for ingestion.
 *
 * This handler only validates, records and enqueues. The archive download and
 * the R2 upload happen asynchronously in the BullMQ worker so the HTTP request
 * returns immediately regardless of repository size.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let claimedKey: string | null = null;

  try {
    const csrf = rejectCrossOrigin(request);
    if (csrf) return csrf;

    // The session -- never the request body -- determines who owns the repository.
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const limit = await checkRateLimit(`submit-repo:${user.id}:${clientIdentifier(request)}`, {
      limit: RATE_LIMITS.submitRepository.limit,
      windowSeconds: RATE_LIMITS.submitRepository.windowSeconds,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "Too many repositories submitted. Try again later." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    // Replay the original response for a repeated Idempotency-Key.
    const idempotencyKey = parseIdempotencyKey(request);
    if (idempotencyKey) {
      const replay = await lookupIdempotent(IDEMPOTENCY_SCOPE, user.id, idempotencyKey);
      if (replay === "IN_PROGRESS") {
        return NextResponse.json(
          { message: "A matching submission is already in progress." },
          { status: 409 },
        );
      }
      if (replay) {
        return NextResponse.json(replay.body, { status: replay.status });
      }
      if (!(await claimIdempotentKey(IDEMPOTENCY_SCOPE, user.id, idempotencyKey))) {
        return NextResponse.json(
          { message: "A matching submission is already in progress." },
          { status: 409 },
        );
      }
      claimedKey = idempotencyKey;
    }

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const url = (parsed.value as { url?: unknown } | null)?.url;

    let ref;
    try {
      ref = parseGitHubRepositoryUrl(url);
    } catch (error) {
      if (error instanceof InvalidRepositoryUrlError) {
        return NextResponse.json({ message: error.message }, { status: 400 });
      }
      throw error;
    }

    let metadata;
    let commitSha: string;
    try {
      metadata = await fetchRepositoryMetadata(ref);
      commitSha = await fetchBranchHeadSha(ref, metadata.defaultBranch);
    } catch (error) {
      if (error instanceof GitHubApiError) {
        const status = error.code === "NOT_FOUND" ? 404 : error.code === "RATE_LIMITED" ? 429 : 502;
        return NextResponse.json({ message: publicGitHubMessage(error.code) }, { status });
      }
      throw error;
    }

    if (metadata.isPrivate) {
      return NextResponse.json(
        { message: "Private repositories are not supported yet" },
        { status: 400 },
      );
    }

    const existing = await db.repository.findUnique({
      where: { userId_owner_name: { userId: user.id, owner: ref.owner, name: ref.repo } },
    });

    if (!existing) {
      const count = await db.repository.count({ where: { userId: user.id } });
      if (count >= MAX_REPOSITORIES_PER_USER) {
        return NextResponse.json(
          { message: `You have reached the limit of ${MAX_REPOSITORIES_PER_USER} repositories.` },
          { status: 409 },
        );
      }
    }

    // Change detection: if the archive we already hold was built from the
    // current head commit, there is nothing new to ingest.
    const isUnchanged =
      existing?.status === "READY" &&
      existing.commitSha !== null &&
      existing.commitSha === commitSha;

    if (existing && isUnchanged) {
      const body = { repository: { ...publicRepository(existing), unchanged: true } };
      if (claimedKey) {
        await storeIdempotentResult(IDEMPOTENCY_SCOPE, user.id, claimedKey, {
          status: 200,
          body,
        });
      }
      return NextResponse.json(body);
    }

    const repository = existing
      ? await db.repository.update({
          where: { id: existing.id },
          data: {
            githubUrl: metadata.canonicalUrl,
            defaultBranch: metadata.defaultBranch,
            latestSha: commitSha,
            pushedAt: metadata.pushedAt,
            license: metadata.license,
            description: metadata.description,
            status: "QUEUED",
            errorMessage: null,
          },
        })
      : await db.repository.create({
          data: {
            userId: user.id,
            githubUrl: metadata.canonicalUrl,
            owner: ref.owner,
            name: ref.repo,
            defaultBranch: metadata.defaultBranch,
            latestSha: commitSha,
            pushedAt: metadata.pushedAt,
            license: metadata.license,
            description: metadata.description,
          },
        });

    // Only identifiers travel through Redis. The deterministic jobId means a
    // repeated submission for the same commit cannot enqueue a second job.
    const queue = getRepositoryIngestionQueue();
    await queue.add(
      "ingest",
      {
        repositoryId: repository.id,
        userId: user.id,
        owner: repository.owner,
        repo: repository.name,
        commitSha,
      },
      { jobId: repositoryIngestionJobId({ repositoryId: repository.id, commitSha }) },
    );

    console.log("[repositories] queued ingestion", {
      repositoryId: repository.id,
      userId: user.id,
      commitSha,
    });

    const status = existing ? 200 : 201;
    const body = { repository: { ...publicRepository(repository), unchanged: false } };

    if (claimedKey) {
      await storeIdempotentResult(IDEMPOTENCY_SCOPE, user.id, claimedKey, { status, body });
    }

    return NextResponse.json(body, { status });
  } catch (error) {
    console.error("repositories POST error:", error);
    // Release the claim so a transient failure can be retried with the same key.
    if (claimedKey) {
      const user = await getCurrentUser();
      if (user) await releaseIdempotentKey(IDEMPOTENCY_SCOPE, user.id, claimedKey);
    }
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

/**
 * Removes a repository from the user's workspace.
 *
 * Deletes the database row and the stored archive. Embeddings for the
 * repository are keyed by repositoryId and are replaced wholesale on the next
 * index run for that id; they are not purged here, so re-adding the same
 * repository starts from a clean index rather than inheriting stale vectors.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const csrf = rejectCrossOrigin(request);
    if (csrf) return csrf;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ message: "A repository id is required" }, { status: 400 });
    }

    // Scoped to the session's user: a guessed id belonging to someone else is
    // simply not found, never deleted.
    const existing = await db.repository.findFirst({ where: { id, userId: user.id } });
    if (!existing) {
      return NextResponse.json({ message: "Repository not found" }, { status: 404 });
    }

    await db.repository.delete({ where: { id } });

    if (existing.storageKey) {
      try {
        await deleteArchive(existing.storageKey);
      } catch (error) {
        // The row is already gone, so the database stays consistent; a leftover
        // object is an operational nuisance rather than a failed delete.
        console.warn("[repositories] could not delete stored archive", {
          repositoryId: id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return NextResponse.json({ deleted: id });
  } catch (error) {
    console.error("repositories DELETE error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

/** Lists the authenticated user's repositories, newest first. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const limit = await checkRateLimit(`queue-read:${user.id}`, {
      limit: RATE_LIMITS.readQueue.limit,
      windowSeconds: RATE_LIMITS.readQueue.windowSeconds,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "Too many requests." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const repositories = await db.repository.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        owner: true,
        name: true,
        githubUrl: true,
        defaultBranch: true,
        latestSha: true,
        commitSha: true,
        status: true,
        sizeBytes: true,
        lastIngestedAt: true,
        errorMessage: true,
        language: true,
      },
    });

    return NextResponse.json({ repositories }, { headers: rateLimitHeaders(limit) });
  } catch (error) {
    console.error("repositories GET error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
