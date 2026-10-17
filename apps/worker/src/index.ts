import { loadRepoEnv } from "@repo/database";

// The repo keeps a single .env at its root. Load it before anything reads
// process.env; @repo/database owns the path resolution so the web app and the
// worker cannot drift apart on where it lives.
loadRepoEnv();

import type { RepositoryIngestionJob } from "@repo/queue";

const { Worker } = await import("bullmq");
const { redisConnectionOptions } = await import("@repo/redis");
const { REPOSITORY_INGESTION_QUEUE } = await import("@repo/queue");
const { ingestRepository } = await import("./ingest.js");

/**
 * Long-lived BullMQ worker for repository ingestion.
 *
 * This runs as its own process (see apps/worker) and is intentionally kept out
 * of the Next.js server: route handlers must never perform the download/upload.
 */
const worker = new Worker<RepositoryIngestionJob>(
  REPOSITORY_INGESTION_QUEUE,
  async (job) => ingestRepository(job),
  {
    // Workers issue blocking commands, so BullMQ requires its own connection.
    connection: redisConnectionOptions({ blocking: true }),
    concurrency: 2,
  },
);

worker.on("ready", () => {
  console.log("[worker] ready, listening on queue:", REPOSITORY_INGESTION_QUEUE);
});

worker.on("completed", (job) => {
  console.log("[worker] job completed", { jobId: job.id, name: job.name });
});

worker.on("failed", (job, error) => {
  console.error("[worker] job failed", {
    jobId: job?.id,
    name: job?.name,
    attemptsMade: job?.attemptsMade,
    reason: error.message,
  });
});

worker.on("error", (error) => {
  console.error("[worker] worker error:", error.message);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received, closing`);
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
