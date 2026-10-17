import { PassThrough, Readable, Transform, pipeline, type TransformCallback } from "node:stream";

/** Raised when a download exceeds the configured archive size ceiling. */
export class ArchiveTooLargeError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`Repository archive exceeds the ${formatBytes(maxBytes)} limit`);
    this.name = "ArchiveTooLargeError";
    this.maxBytes = maxBytes;
  }
}

function formatBytes(bytes: number): string {
  const megabytes = bytes / 1024 / 1024;
  // Keeps the message sensible for very small limits instead of rounding to "0 MB".
  return megabytes >= 1 ? `${Math.round(megabytes)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** Raised when GitHub does not return a usable archive. */
export class ArchiveDownloadError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ArchiveDownloadError";
    this.status = status;
  }
}

/**
 * Fails the stream if more than `maxBytes` flow through it.
 *
 * content-length is only a hint (and is frequently absent for chunked
 * responses), so the byte count is enforced as the data streams rather than
 * trusted up front. The running total is also what `sizeBytes` is recorded from.
 */
class SizeGuard extends Transform {
  private seen = 0;

  constructor(private readonly maxBytes: number) {
    super();
  }

  get bytesRead(): number {
    return this.seen;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
    this.seen += chunk.length;
    if (this.seen > this.maxBytes) {
      callback(new ArchiveTooLargeError(this.maxBytes));
      return;
    }
    callback(null, chunk);
  }
}

export interface ArchiveStream {
  stream: Readable;
  /** Declared content length when GitHub supplied one. */
  declaredLength: number | undefined;
  /** Bytes transferred so far; accurate once the stream has been consumed. */
  bytesRead: () => number;
}

export interface DownloadArchiveParams {
  url: string;
  maxBytes: number;
  timeoutMs: number;
}

/**
 * Opens a streaming HTTP response for a repository archive.
 *
 * The body is piped straight through a size guard and handed back as a stream;
 * the archive is never accumulated in memory.
 */
export async function downloadArchive(params: DownloadArchiveParams): Promise<ArchiveStream> {
  let response: Response;

  try {
    response = await fetch(params.url, {
      // GitHub redirects archive requests to codeload.github.com.
      redirect: "follow",
      signal: AbortSignal.timeout(params.timeoutMs),
      headers: {
        "User-Agent": "NexusRAG-Ingestion",
        Accept: "application/x-gzip, application/octet-stream",
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error";
    throw new ArchiveDownloadError(`Archive download failed: ${reason}`, 502);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new ArchiveDownloadError("Repository archive not found", 404);
    }
    if (response.status === 429) {
      throw new ArchiveDownloadError(
        "GitHub rate limit reached while downloading the archive",
        429,
      );
    }
    throw new ArchiveDownloadError(
      `GitHub responded with ${response.status} while downloading the archive`,
      502,
    );
  }

  if (!response.body) {
    throw new ArchiveDownloadError("GitHub returned an empty archive response", 502);
  }

  const declaredRaw = response.headers.get("content-length");
  const declared = declaredRaw ? Number(declaredRaw) : undefined;

  // Reject early when GitHub tells us it is oversized, and keep enforcing the
  // limit while streaming for the cases where it does not.
  if (declared !== undefined && Number.isFinite(declared) && declared > params.maxBytes) {
    throw new ArchiveTooLargeError(params.maxBytes);
  }

  const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);

  const guard = new SizeGuard(params.maxBytes);
  const sink = new PassThrough();

  // `pipeline` rather than `pipe`: it forwards source errors onto the returned
  // stream and, critically, tears the GitHub connection down when the consumer
  // goes away. With a bare `pipe`, an aborted R2 upload would leave the download
  // streaming into nothing.
  pipeline(body, guard, sink, () => {
    // Errors surface on `sink` for the consumer; this callback only exists to
    // stop pipeline from throwing an unhandled error.
  });

  return {
    stream: sink,
    declaredLength: declared !== undefined && Number.isFinite(declared) ? declared : undefined,
    bytesRead: () => guard.bytesRead,
  };
}
