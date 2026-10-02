import { Redis } from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

let redisInstance: Redis | undefined;

function getRedisClient(): Redis {
  if (redisInstance) return redisInstance;
  
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is not defined");
  }
  redisInstance = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
  });
  return redisInstance;
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