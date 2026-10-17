import type { Readable } from "node:stream";

import { DeleteObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

import { getR2Bucket, getR2Client } from "./client.js";

/**
 * Deterministic object key for a repository archive.
 *
 * Because the key is derived only from identifiers that the server controls, a
 * BullMQ retry (or a duplicate job) overwrites the exact same object rather than
 * creating a second copy. That is what makes the pipeline idempotent.
 */
export function buildRepositoryArchiveKey(params: {
  userId: string;
  repositoryId: string;
  commitSha: string;
}): string {
  return `repositories/${params.userId}/${params.repositoryId}/${params.commitSha}.tar.gz`;
}

export interface UploadArchiveParams {
  key: string;
  body: Readable;
  /** Known content length in bytes, when the source reported one. */
  contentLength?: number | undefined;
  contentType?: string | undefined;
  /** Caps the total upload so a stalled connection cannot hold a worker slot. */
  abortSignal?: AbortSignal | undefined;
}

/**
 * Streams `body` straight into R2 using a multipart upload.
 *
 * The archive is never buffered in memory: @aws-sdk/lib-storage reads the
 * readable incrementally and spills to multipart once it crosses the part size.
 */
export async function uploadArchive(params: UploadArchiveParams): Promise<{ key: string }> {
  const client = getR2Client();
  const bucket = getR2Bucket();

  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentLength: params.contentLength,
      ContentType: params.contentType ?? "application/gzip",
    },
  });

  // `Upload` exposes abort() instead of accepting a controller, so bridge the
  // caller's AbortSignal onto it.
  const onAbort = () => {
    void upload.abort();
  };
  params.abortSignal?.addEventListener("abort", onAbort, { once: true });

  try {
    await upload.done();
  } finally {
    params.abortSignal?.removeEventListener("abort", onAbort);
  }

  return { key: params.key };
}

/**
 * Removes an object from R2. Used to drop a superseded commit's archive so
 * re-ingesting a repository does not accumulate one dead object per commit.
 */
export async function deleteArchive(key: string, client?: S3Client): Promise<void> {
  await (client ?? getR2Client()).send(
    new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: key }),
  );
}
