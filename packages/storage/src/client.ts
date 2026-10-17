import { S3Client } from "@aws-sdk/client-s3";

/** Reads a required environment variable, failing loudly rather than silently. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not defined`);
  }
  return value;
}

/**
 * Which S3-compatible provider is configured.
 *
 * R2 and MinIO speak the same S3 API, so the upload code is shared; only the
 * endpoint and credentials differ. S3_ENDPOINT takes priority when present so a
 * self-hosted MinIO can be swapped in without clearing the R2 variables.
 */
export type StorageProvider = "r2" | "s3";

export interface StorageTarget {
  provider: StorageProvider;
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  forcePathStyle: boolean;
}

function has(name: string): boolean {
  return Boolean(process.env[name]);
}

export function resolveStorage(): StorageTarget {
  // Generic S3 / MinIO first: an explicit endpoint is an unambiguous signal.
  if (has("S3_ENDPOINT")) {
    return {
      provider: "s3",
      endpoint: requireEnv("S3_ENDPOINT"),
      bucket: requireEnv("S3_BUCKET"),
      accessKeyId: requireEnv("S3_ACCESS_KEY"),
      secretAccessKey: requireEnv("S3_SECRET_KEY"),
      // MinIO ignores the region but the SDK still requires one.
      region: process.env.S3_REGION || "us-east-1",
      // MinIO is normally addressed path-style: http://host:9000/<bucket>/<key>
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    };
  }

  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  return {
    provider: "r2",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    bucket: requireEnv("R2_BUCKET_NAME"),
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    // R2 has no meaningful regions and requires the literal "auto".
    region: "auto",
    forcePathStyle: true,
  };
}

/** Bucket the archives live in, whichever provider is configured. */
export function getR2Bucket(): string {
  return resolveStorage().bucket;
}

/**
 * Shared S3-compatible client for Cloudflare R2 or MinIO.
 *
 * Server-side only -- credentials from here must never reach the browser.
 */
function buildClient(): S3Client {
  const target = resolveStorage();

  return new S3Client({
    region: target.region,
    endpoint: target.endpoint,
    credentials: {
      accessKeyId: target.accessKeyId,
      secretAccessKey: target.secretAccessKey,
    },
    // Path-style avoids the bucket-name constraints of virtual-hosted style,
    // which R2 and MinIO both require for non-DNS-compatible bucket names.
    forcePathStyle: target.forcePathStyle,
  });
}

let sharedClient: S3Client | undefined;

/** Lazily-created shared client. */
export function getR2Client(): S3Client {
  if (!sharedClient) {
    sharedClient = buildClient();
  }
  return sharedClient;
}
