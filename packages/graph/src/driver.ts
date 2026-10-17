/**
 * Neo4j driver for the code graph.
 *
 * Semantic similarity cannot answer "what depends on UserService" -- that is a
 * structural question, so relationships between files, symbols and modules are
 * stored explicitly.
 */

import neo4j, { type Driver, type Session } from "neo4j-driver";

let driver: Driver | undefined;

/**
 * Builds the driver from environment values.
 *
 * Cloud note: Neo4j Aura issues a `neo4j+s://<id>.databases.neo4j.io` URI. The
 * `+s` scheme is TLS-routed and must be preserved verbatim -- rewriting it to
 * `neo4j://` breaks the connection.
 */
export function getGraphDriver(): Driver {
  if (driver) return driver;

  const uri = process.env.NEO4J_URI;
  if (!uri) {
    throw new Error("NEO4J_URI is not defined");
  }

  const username = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;
  if (!username || !password) {
    throw new Error("NEO4J_USERNAME and NEO4J_PASSWORD are required");
  }

  // `neo4j+s://` already means "TLS required" to the driver, so `encrypted` is
  // left unset there. A plain `neo4j://` URI defaults to unencrypted unless
  // NEO4J_ENCRYPTED=true, which is how a local container is addressed.
  const wantsTls = process.env.NEO4J_ENCRYPTED === "true";

  driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 30_000,
    ...(wantsTls ? { encrypted: true } : {}),
  });

  return driver;
}

/** Runs a read query. Sessions must be closed or the pool leaks. */
export async function withSession<T>(
  work: (session: Session) => Promise<T>,
  mode: "READ" | "WRITE" = "READ",
): Promise<T> {
  const session = getGraphDriver().session({ defaultAccessMode: mode });
  try {
    return await work(session);
  } finally {
    await session.close();
  }
}

/** Cheap liveness probe used by the env doctor. */
export async function pingGraph(): Promise<boolean> {
  try {
    await withSession(async (session) => {
      await session.run("RETURN 1 AS ok");
    });
    return true;
  } catch {
    return false;
  } finally {
    await getGraphDriver()
      .close()
      .catch(() => undefined);
  }
}
