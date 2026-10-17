import { Queue, type JobsOptions } from "bullmq";

import { redisConnectionOptions } from "@repo/redis";

export const REPOSITORY_INGESTION_QUEUE = "repository-ingestion";

/**
 * Second stage: index a stored archive into Qdrant, Elasticsearch and Neo4j.
 *
 * Deliberately a separate queue from ingestion. Both services consume BullMQ,
 * and two consumers on one queue compete -- whichever polls first takes the
 * job. The archive-fetching worker and the indexing service need different
 * resources and different failure modes, so they get their own lanes.
 */
export const REPOSITORY_INDEXING_QUEUE = "repository-indexing";

/**
 * The BullMQ payload for repository ingestion.
 *
 * Only identifiers and small scalars travel through Redis -- never repository
 * content. The worker re-reads everything else from PostgreSQL and streams the
 * archive straight from GitHub into R2.
 */
export interface RepositoryIngestionJob {
  repositoryId: string;
  userId: string;
  owner: string;
  repo: string;
  commitSha: string;
}

/**
 * The indexing stage's payload.
 *
 * Carries the storage key explicitly: the indexing service may run in a
 * different process or on a different host, so it cannot rely on re-deriving
 * the path the writer happened to use.
 */
export interface RepositoryIndexingJob extends RepositoryIngestionJob {
  storageKey: string;
}

export const REPOSITORY_INGESTION_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5_000,
  },
  // Keep a short tail of completed jobs for debugging, retain failures for a day.
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 60 * 60 },
};

/**
 * Deterministic job id for a (repository, commit) pair.
 *
 * BullMQ refuses to add a second job while an identical jobId is still
 * retained, so a double-clicked form or a retried HTTP request cannot enqueue
 * duplicate ingestion work.
 *
 * Note: BullMQ rejects `:` in custom ids ("Custom Id cannot contain :"), so
 * the separator must be a different character.
 */
export function repositoryIngestionJobId(job: { repositoryId: string; commitSha: string }): string {
  return `${job.repositoryId}-${job.commitSha}`;
}

let queue: Queue<RepositoryIngestionJob> | undefined;
let indexingQueue: Queue<RepositoryIndexingJob> | undefined;

/**
 * Lazily-created producer queue for the archive-fetching stage.
 *
 * BullMQ constructs its own connection from these plain options rather than
 * being handed this package's ioredis instance: BullMQ bundles ioredis 5 while
 * @repo/redis is on ioredis 6, and the two `Redis` types are incompatible.
 */
export function getRepositoryIngestionQueue(): Queue<RepositoryIngestionJob> {
  if (!queue) {
    queue = new Queue<RepositoryIngestionJob>(REPOSITORY_INGESTION_QUEUE, {
      connection: redisConnectionOptions(),
      defaultJobOptions: REPOSITORY_INGESTION_JOB_OPTIONS,
    });
  }
  return queue;
}

/** Producer queue for the indexing stage, consumed by apps/ai-service. */
export function getRepositoryIndexingQueue(): Queue<RepositoryIndexingJob> {
  if (!indexingQueue) {
    indexingQueue = new Queue<RepositoryIndexingJob>(REPOSITORY_INDEXING_QUEUE, {
      connection: redisConnectionOptions(),
      defaultJobOptions: REPOSITORY_INGESTION_JOB_OPTIONS,
    });
  }
  return indexingQueue;
}

export interface IngestionQueueStats {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  paused: number;
  total: number;
}

/**
 * Queue depth snapshot, for the ingestion health endpoint.
 *
 * Reports the whole queue rather than a single user: worker capacity is a shared
 * resource, and the operator question is "is ingestion backed up", not "is this
 * one user backed up". The endpoint that exposes this is admin-gated.
 */
export async function getIngestionQueueStats(): Promise<IngestionQueueStats> {
  const counts = await getRepositoryIngestionQueue().getJobCounts(
    "waiting",
    "active",
    "delayed",
    "failed",
    "paused",
  );

  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    delayed: counts.delayed ?? 0,
    failed: counts.failed ?? 0,
    paused: counts.paused ?? 0,
    total: Object.values(counts).reduce((sum, value) => sum + value, 0),
  };
}
