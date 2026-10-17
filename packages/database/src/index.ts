import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Loads the monorepo-root `.env`.
 *
 * This is not redundant with Next's own env handling and must not be removed:
 * the repo keeps a single `.env` at the root, while Next only reads env files
 * from `apps/web`. Without this call the web app would start with no
 * DATABASE_URL, no session Redis and no OAuth credentials.
 *
 * Exported so other entry points (the worker, scripts, tests) share one
 * implementation instead of re-deriving the path.
 */
export function loadRepoEnv(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(here, "../../../.env");
  config({ path: envPath });
  return envPath;
}

loadRepoEnv();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prismaInstance: PrismaClient | undefined;

function getPrismaClient(): PrismaClient {
  if (prismaInstance) return prismaInstance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not defined");
  }

  // Use SSL only for remote connections (Aiven), not for local
  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

  const adapter = new PrismaPg({
    connectionString,
    ssl: isLocal
      ? false
      : {
          rejectUnauthorized: false,
        },
  });
  prismaInstance = new PrismaClient({ adapter });
  console.log("[database] Prisma client created successfully");
  return prismaInstance;
}

export const db = new Proxy({} as PrismaClient, {
  get(target, prop) {
    const client = getPrismaClient();
    const value = client[prop as keyof PrismaClient];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaInstance!;
}
