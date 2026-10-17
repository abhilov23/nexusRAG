import type { Job } from "bullmq";

import { db } from "@repo/database";
import { buildArchiveUrl } from "@repo/github";
import { getRepositoryIndexingQueue, type RepositoryIngestionJob } from "@repo/queue";
import { buildRepositoryArchiveKey, deleteArchive, uploadArchive } from "@repo/storage";

import { downloadArchive } from "./download.js";

/** Hard ceiling on a single repository archive. */
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024; // 512 MB
/** Wall-clock ceiling for the GitHub archive request. */
export const ARCHIVE_TIMEOUT_MS = 5 * 60 * 1000;
/** Wall-clock ceiling for pushing the archive into R2. */
export const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

const MAX_ERROR_MESSAGE_LENGTH = 500;

function describeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  // Defensive redaction: never persist anything that looks like a credential.
  const redacted = raw
    .replace(/gh[pousr]_[A-Za-z0-9]{10,}/g, "[redacted]")
    .replace(/(access[_-]?key|secret|token|password)=\S+/gi, "$1=[redacted]")
    .replace(/:\/\/[^@\s]*@/g, "://[redacted]@");

  return redacted.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

export interface IngestResult {
  skipped: boolean;
  storageKey?: string;
  sizeBytes?: number;
}

/**
 * Downloads one repository archive and streams it into Cloudflare R2.
 *
 * Status is advanced as the pipeline progresses. A failure only marks the
 * repository FAILED once BullMQ has exhausted its retries; while retries
 * remain, the record keeps its in-flight status.
 */
export async function ingestRepository(job: Job<RepositoryIngestionJob>): Promise<IngestResult> {
  const { repositoryId, userId, commitSha } = job.data;

  const repository = await db.repository.findUnique({ where: { id: repositoryId } });
  if (!repository) {
    throw new Error(`Repository ${repositoryId} no longer exists`);
  }

  // Converge instead of redoing work: a retry of a job whose archive already
  // landed at this exact commit is a no-op.
  if (repository.status === "READY" && repository.commitSha === commitSha) {
    return { skipped: true };
  }

  const attempts = job.opts.attempts ?? 1;
  const willRetry = job.attemptsMade + 1 < attempts;

  try {
    await db.repository.update({
      where: { id: repositoryId },
      data: { status: "DOWNLOADING", errorMessage: null },
    });

    console.log("[ingest] download started", { repositoryId, jobId: job.id, commitSha });

    const archiveUrl = buildArchiveUrl({
      owner: repository.owner,
      repo: repository.name,
      commitSha,
    });

    const { stream, declaredLength, bytesRead } = await downloadArchive({
      url: archiveUrl,
      maxBytes: MAX_ARCHIVE_BYTES,
      timeoutMs: ARCHIVE_TIMEOUT_MS,
    });

    await db.repository.update({
      where: { id: repositoryId },
      data: { status: "UPLOADING" },
    });

    console.log("[ingest] upload started", { repositoryId, jobId: job.id });

    const storageKey = buildRepositoryArchiveKey({
      userId,
      repositoryId,
      commitSha,
    });

    const uploadAbort = new AbortController();
    const uploadTimer = setTimeout(() => uploadAbort.abort(), UPLOAD_TIMEOUT_MS);

    try {
      await uploadArchive({
        key: storageKey,
        body: stream,
        contentLength: declaredLength,
        abortSignal: uploadAbort.signal,
      });
    } finally {
      clearTimeout(uploadTimer);
    }

    // The archive is stored, but nothing is searchable yet. The Python
    // indexing stage reports back through the internal callback, which flips
    // this to READY -- or FAILED with the real error.
    await db.repository.update({
      where: { id: repositoryId },
      data: {
        status: "INDEXING",
        storageKey,
        commitSha,
        sizeBytes: bytesRead(),
        errorMessage: null,
      },
    });

    console.log("[ingest] uploaded", {
      repositoryId,
      jobId: job.id,
      storageKey,
      sizeBytes: bytesRead(),
    });

    // The key embeds the commit, so a newer commit always writes a new object.
    // Drop the one it supersedes instead of leaving it orphaned forever.
    const supersededKey = repository.storageKey;
    if (supersededKey && supersededKey !== storageKey) {
      try {
        await deleteArchive(supersededKey);
        console.log("[ingest] deleted superseded archive", {
          repositoryId,
          key: supersededKey,
        });
      } catch (error) {
        // A stale object is an operational nuisance, not a failed ingestion.
        console.warn("[ingest] could not delete superseded archive", {
          repositoryId,
          key: supersededKey,
          reason: describeError(error),
        });
      }
    }

    // Hand off to the indexing stage.
    //
    // On its own queue, not this one: apps/ai-service consumes BullMQ too, and
    // two consumers sharing a queue race for jobs. Enqueuing the next stage is
    // also what makes the pipeline resumable -- if indexing fails, the archive
    // is already in storage and only the second stage needs retrying.
    await getRepositoryIndexingQueue().add(
      "index",
      {
        repositoryId,
        userId,
        owner: repository.owner,
        repo: repository.name,
        commitSha,
        storageKey,
      },
      { jobId: `${repositoryId}-${commitSha}` },
    );

    return { skipped: false, storageKey };
  } catch (error) {
    if (!willRetry) {
      await db.repository.update({
        where: { id: repositoryId },
        data: { status: "FAILED", errorMessage: describeError(error) },
      });
    }

    console.error("[ingest] failed", {
      repositoryId,
      jobId: job.id,
      attempt: job.attemptsMade + 1,
      attempts,
      willRetry,
      reason: describeError(error),
    });

    // Rethrow so BullMQ applies its own backoff/retry policy.
    throw error;
  }
}
