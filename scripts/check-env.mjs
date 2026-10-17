/**
 * Environment doctor.
 *
 *   pnpm doctor
 *
 * Two passes: every required variable must be present and non-placeholder, and
 * every service that is configured must actually answer. Run this after pasting
 * credentials into `.env` -- it tells you which one is wrong instead of leaving
 * you to discover it through a failed request.
 *
 * Read-only: it never writes to `.env` and never mutates a service.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- load .env (Node 22 has no automatic .env loading) ----------------------

function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return false;

  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  return true;
}

// --- reporting --------------------------------------------------------------

const results = [];
let failures = 0;

function record(ok, service, detail) {
  results.push({ ok, service, detail });
  if (!ok) failures += 1;
}

/** Values that are obviously templates rather than real credentials. */
function isPlaceholder(value) {
  return !value || /^("|')?(\.\.\.|<.*>|your-.*|changeme|xxx+)/i.test(value);
}

function checkVars(service, names, { anyOf } = {}) {
  if (anyOf) {
    const configured = anyOf.filter((n) => !isPlaceholder(process.env[n]));
    if (configured.length === 0) {
      record(false, service, `not configured (need one of: ${anyOf.join(", ")})`);
      return false;
    }
    record(true, service, `configured via ${configured.join(", ")}`);
    return true;
  }

  const missing = names.filter((n) => isPlaceholder(process.env[n]));
  if (missing.length > 0) {
    record(false, service, `missing: ${missing.join(", ")}`);
    return false;
  }
  record(true, service, "configured");
  return true;
}

/**
 * Node reports connection failures as an AggregateError whose `message` is an
 * empty string, so the code is the only useful diagnostic. Fall back through
 * message -> code -> constructor name.
 */
function describeError(error) {
  // A failed TLS handshake arrives as an AggregateError whose `cause` carries
  // the real reason -- usually an unmatched server name, which looks like a
  // generic network failure without it.
  const cause = error?.cause;
  if (cause?.message) {
    return `${cause.message}`.slice(0, 140);
  }
  if (error instanceof Error) {
    if (error.message) return error.message;
    const code = error.code ?? error.errors?.[0]?.code;
    if (code) return `${error.name}(${code})`;
    if (Array.isArray(error.errors) && error.errors.length > 0) {
      const nested = error.errors.map((e) => e.code ?? e.message).filter(Boolean);
      if (nested.length > 0) return `${error.name}: ${nested.join(" + ")}`;
    }
    return error.name;
  }
  return String(error);
}

async function probe(service, fn) {
  const started = Date.now();
  try {
    await fn();
    record(true, service, `reachable (${Date.now() - started}ms)`);
  } catch (error) {
    record(false, service, `unreachable -- ${describeError(error).slice(0, 110)}`);
  }
}

// --- checks -----------------------------------------------------------------

const hasEnv = loadEnv();
if (!hasEnv) {
  console.log("No .env found at the repo root.");
  console.log("  cp .env.example .env    then fill it in and run: pnpm doctor\n");
}

checkVars("app", ["APP_URL"]);

if (checkVars("postgres", ["DATABASE_URL"])) {
  await probe("postgres", async () => {
    const { Pool } = await import("pg");
    const url = process.env.DATABASE_URL;
    const local = url.includes("localhost") || url.includes("127.0.0.1");
    // Same policy @repo/database uses: TLS for anything not on loopback.
    const pool = new Pool({
      connectionString: url,
      ssl: local ? false : { rejectUnauthorized: false },
    });
    try {
      const client = await pool.connect();
      client.release();
    } finally {
      await pool.end();
    }
  });
}

if (checkVars("redis", ["REDIS_URL"])) {
  await probe("redis", async () => {
    const { redis } = await import("@repo/redis");
    const pong = await redis.ping();
    if (pong !== "PONG") throw new Error(`unexpected ping: ${pong}`);
  });
}

const storageConfigured = checkVars("object storage", ["R2_BUCKET_NAME"], {
  anyOf: ["R2_BUCKET_NAME", "S3_BUCKET"],
});
if (storageConfigured) {
  await probe("object storage", async () => {
    const { HeadBucketCommand, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const { getR2Client, getR2Bucket } = await import("@repo/storage");

    const client = getR2Client();
    const bucket = getR2Bucket();

    // HeadBucket, not ListBuckets: R2 API tokens are scoped to specific
    // buckets and are denied the bucket-wide listing even when the token is
    // valid for the bucket it was issued for. Probing the wrong scope reports
    // a working credential as broken.
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return;
    } catch (error) {
      const name = error?.name ?? "";
      const status = error?.$metadata?.httpStatusCode;
      // 403 means "token cannot see this bucket" -- a real credential problem.
      // 404 on HEAD is ambiguous across S3 implementations, so fall through to
      // a listing, which is unambiguous.
      if (name === "AccessDenied" || status === 403) throw error;
    }

    await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
  });
}

if (checkVars("qdrant", ["QDRANT_URL"])) {
  await probe("qdrant", async () => {
    const { QdrantClient } = await import("@qdrant/js-client-rest");
    const client = new QdrantClient({
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
    });
    await client.getCollections();
  });
}

if (checkVars("elasticsearch", ["ELASTICSEARCH_URL"])) {
  await probe("elasticsearch", async () => {
    const { Client } = await import("@elastic/elasticsearch");
    const apiKey = process.env.ELASTICSEARCH_API_KEY;
    const username = process.env.ELASTICSEARCH_USERNAME;
    const password = process.env.ELASTICSEARCH_PASSWORD;
    const auth = apiKey ? { apiKey } : username && password ? { username, password } : {};
    const client = new Client({
      node: process.env.ELASTICSEARCH_URL,
      ...(Object.keys(auth).length ? { auth } : {}),
      tls: { rejectUnauthorized: process.env.ELASTICSEARCH_REJECT_UNAUTHORIZED !== "false" },
    });
    await client.info();
  });
}

if (checkVars("neo4j", ["NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD"])) {
  await probe("neo4j", async () => {
    const { pingGraph } = await import("@repo/graph");
    const ok = await pingGraph();
    if (!ok) throw new Error("driver could not run a query");
  });
}

// Recorded once, by checkVars; recording again here duplicated the row.
checkVars("github oauth", ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"]);

record(
  !isPlaceholder(process.env.GITHUB_TOKEN),
  "github token",
  isPlaceholder(process.env.GITHUB_TOKEN)
    ? "not set -- outbound API limited to ~60 req/hour"
    : "configured",
);

checkVars("email", ["RESEND_API_KEY", "EMAIL_FROM"]);
// The embedding key resolves through EMBEDDING_API_KEY -> LLM_API_KEY ->
// OPENAI_API_KEY, matching ai_service.config.Settings. Checking only
// OPENAI_API_KEY reported "missing" for a correctly configured deployment.
const embeddingKey =
  process.env.EMBEDDING_API_KEY || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;

checkVars("embeddings", ["EMBEDDING_MODEL", "EMBEDDING_DIMENSIONS"]);
record(
  Boolean(embeddingKey),
  "embedding key",
  embeddingKey ? "configured" : "set EMBEDDING_API_KEY or LLM_API_KEY (OPENAI_API_KEY also works)",
);

if (embeddingKey && process.env.EMBEDDING_BASE_URL) {
  await probe("embeddings", async () => {
    const response = await fetch(
      `${process.env.EMBEDDING_BASE_URL.replace(/\/$/, "")}/embeddings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${embeddingKey}`,
        },
        body: JSON.stringify({
          model: process.env.EMBEDDING_MODEL,
          input: ["connectivity probe"],
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} — check the model name and key`);
    }
    const payload = await response.json();
    const size = payload?.data?.[0]?.embedding?.length;
    if (!size) throw new Error("response had no embedding array");
    if (size !== Number(process.env.EMBEDDING_DIMENSIONS)) {
      throw new Error(
        `model returns ${size}-dim vectors but EMBEDDING_DIMENSIONS is ${process.env.EMBEDDING_DIMENSIONS}`,
      );
    }
  });
}

// --- output -----------------------------------------------------------------

console.log("");
for (const { ok, service, detail } of results) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${service.padEnd(16)} ${detail}`);
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);

if (failures > 0) {
  console.log(
    "\nMissing values are expected until credentials are filled in.\n" +
      "Every variable is documented in .env.example.",
  );
}

process.exit(0);
