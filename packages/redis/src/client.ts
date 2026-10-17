import { Redis } from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

let redisInstance: Redis | undefined;

function requireRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is not defined");
  }
  return redisUrl;
}

function getRedisClient(): Redis {
  if (redisInstance) return redisInstance;

  redisInstance = new Redis(requireRedisUrl(), {
    maxRetriesPerRequest: 3,
  });
  return redisInstance;
}

/**
 * A plain, library-agnostic description of the Redis connection.
 *
 * Consumers that build their own client (BullMQ currently bundles ioredis 5
 * while this package uses ioredis 6, so the two `Redis` types are structurally
 * incompatible) should take these options and construct their own connection
 * rather than being handed our ioredis instance.
 */
export interface RedisConnectionConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: object;
  maxRetriesPerRequest: number | null;
}

/** Derives connection options from REDIS_URL without instantiating a client. */
export function redisConnectionOptions(options?: {
  /** Set for BullMQ workers / blocking consumers. Defaults to false. */
  blocking?: boolean;
}): RedisConnectionConfig {
  const url = new URL(requireRedisUrl());
  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined;

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number.isFinite(db) ? db : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: options?.blocking ? null : 3,
  };
}

/**
 * Creates a dedicated Redis connection.
 *
 * BullMQ workers use blocking commands (BRPOPLPUSH etc.) and therefore require
 * `maxRetriesPerRequest: null` -- BullMQ implements its own retry/backoff and
 * fails loudly if the connection also retries. The shared singleton above keeps
 * the app default of 3, so blocking consumers must build their own connection
 * rather than reusing it.
 */
export function createRedisConnection(options?: {
  /** Set for BullMQ workers / blocking consumers. Defaults to false. */
  blocking?: boolean;
}): Redis {
  return new Redis(requireRedisUrl(), {
    maxRetriesPerRequest: options?.blocking ? null : 3,
  });
}

export const redis = new Proxy({} as Redis, {
  get(target, prop) {
    const client = getRedisClient();
    const value = client[prop as keyof Redis];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redisInstance!;
}
