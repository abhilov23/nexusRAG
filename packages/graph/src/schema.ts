/**
 * Code graph schema and queries.
 *
 * Semantic similarity cannot answer "what depends on UserService" -- that is a
 * structural question. These nodes and edges make the structure explicit so it
 * can be traversed.
 */

import { getGraphDriver, withSession } from "./driver.js";

export type SymbolKind = "FILE" | "FUNCTION" | "CLASS" | "METHOD" | "INTERFACE" | "MODULE";

export type Relationship =
  "CONTAINS" | "IMPORTS" | "CALLS" | "EXTENDS" | "IMPLEMENTS" | "REFERENCES";

export type SymbolNode = {
  repositoryId: string;
  commitSha: string;
  /** `repoId:path:symbol` — unique within a repository. */
  key: string;
  name: string;
  kind: SymbolKind;
  path: string;
  language: string;
  startLine: number;
  endLine: number;
};

/**
 * Constraints and indexes.
 *
 * Idempotent, so it is safe to run on every worker boot. The uniqueness
 * constraint on (repositoryId, key) is what makes re-indexing replace rather
 * than duplicate.
 */
export const GRAPH_SCHEMA_STATEMENTS = [
  "CREATE CONSTRAINT symbol_key IF NOT EXISTS FOR (s:Symbol) REQUIRE (s.repositoryId, s.key) IS UNIQUE",
  "CREATE CONSTRAINT symbol_repository IF NOT EXISTS FOR (s:Symbol) REQUIRE s.repositoryId IS NOT NULL",
  "CREATE INDEX symbol_name IF NOT EXISTS FOR (s:Symbol) ON (s.name)",
  "CREATE INDEX symbol_path IF NOT EXISTS FOR (s:Symbol) ON (s.path)",
  "CREATE INDEX file_repository IF NOT EXISTS FOR (f:File) REQUIRE (f.repositoryId, f.path) IS UNIQUE",
];

export async function ensureGraphSchema(): Promise<void> {
  await withSession(async (session) => {
    for (const statement of GRAPH_SCHEMA_STATEMENTS) {
      await session.run(statement);
    }
  });
}

/** Replaces a repository's subgraph with `nodes` and `edges`. */
export async function replaceSubgraph(
  repositoryId: string,
  nodes: SymbolNode[],
  edges: { from: string; to: string; type: Relationship }[],
): Promise<void> {
  const driver = getGraphDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    await session.executeWrite(async (tx) => {
      // Detach-delete rather than DELETE: leaving dangling edges behind is how a
      // graph starts returning nodes that point at nothing.
      await tx.run(
        `MATCH (s:Symbol {repositoryId: $repositoryId})
         DETACH DELETE s`,
        { repositoryId },
      );
      await tx.run(`MATCH (f:File {repositoryId: $repositoryId}) DETACH DELETE f`, {
        repositoryId,
      });

      for (const node of nodes) {
        await tx.run(
          `MERGE (s:Symbol {repositoryId: $repositoryId, key: $key})
           SET s.name = $name, s.kind = $kind, s.path = $path,
               s.language = $language, s.startLine = $startLine,
               s.endLine = $endLine, s.commitSha = $commitSha`,
          // Spreading `node` after the explicit repositoryId would overwrite it,
          // since SymbolNode carries its own repositoryId.
          { ...node, repositoryId },
        );
      }

      for (const edge of edges) {
        await tx.run(
          `MATCH (a:Symbol {repositoryId: $repositoryId, key: $from}),
                 (b:Symbol {repositoryId: $repositoryId, key: $to})
           MERGE (a)-[r:RELATES {type: $type}]->(b)`,
          { repositoryId, from: edge.from, to: edge.to, type: edge.type },
        );
      }
    });
  } finally {
    await session.close();
  }
}

export type DependencyNode = {
  key: string;
  name: string;
  kind: SymbolKind;
  path: string;
  depth: number;
};

/** What depends on this symbol, transitively. */
export async function findDependents(
  repositoryId: string,
  symbolKey: string,
  maxDepth = 3,
): Promise<DependencyNode[]> {
  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (target:Symbol {repositoryId: $repositoryId, key: $symbolKey})
       MATCH path = (dependent:Symbol)-[:RELATES*1..${maxDepth}]->(target)
       WHERE ALL(r IN relationships(path) WHERE r.type IN ['CALLS','IMPORTS','REFERENCES'])
       RETURN DISTINCT dependent.key AS key, dependent.name AS name,
              dependent.kind AS kind, dependent.path AS path,
              length(path) AS depth
       ORDER BY depth ASC, dependent.name ASC
       LIMIT 100`,
      { repositoryId, symbolKey },
    );
    return result.records.map((r) => r.toObject() as DependencyNode);
  });
}

/** What this symbol depends on, transitively. */
export async function findDependencies(
  repositoryId: string,
  symbolKey: string,
  maxDepth = 3,
): Promise<DependencyNode[]> {
  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (source:Symbol {repositoryId: $repositoryId, key: $symbolKey})
       MATCH path = (source)-[:RELATES*1..${maxDepth}]->(dependency:Symbol)
       WHERE ALL(r IN relationships(path) WHERE r.type IN ['CALLS','IMPORTS','REFERENCES'])
       RETURN DISTINCT dependency.key AS key, dependency.name AS name,
              dependency.kind AS kind, dependency.path AS path,
              length(path) AS depth
       ORDER BY depth ASC, dependency.name ASC
       LIMIT 100`,
      { repositoryId, symbolKey },
    );
    return result.records.map((r) => r.toObject() as DependencyNode);
  });
}

export type ImpactReport = {
  directDependents: number;
  totalDependents: number;
  filesTouched: number;
  topDependents: DependencyNode[];
};

/**
 * Impact analysis: what breaks if this symbol changes.
 *
 * Direct and transitive counts are reported separately because a blast radius of
 * "140 files" is only meaningful next to "3 call this directly".
 */
export async function impactOf(
  repositoryId: string,
  symbolKey: string,
  maxDepth = 4,
): Promise<ImpactReport> {
  const [direct, transitive] = await Promise.all([
    findDependents(repositoryId, symbolKey, 1),
    findDependents(repositoryId, symbolKey, maxDepth),
  ]);

  return {
    directDependents: direct.length,
    totalDependents: transitive.length,
    filesTouched: new Set(transitive.map((node) => node.path)).size,
    topDependents: transitive.slice(0, 10),
  };
}

export type GraphSnapshot = {
  nodes: SymbolNode[];
  edges: { from: string; to: string; type: Relationship }[];
};

/**
 * A subgraph for visualisation.
 *
 * Bounded by count as well as depth: a large monorepo would otherwise return
 * tens of thousands of nodes and hang the browser.
 */
export async function graphSnapshot(repositoryId: string, limit = 300): Promise<GraphSnapshot> {
  return withSession(async (session) => {
    const nodes = await session.run(
      `MATCH (s:Symbol {repositoryId: $repositoryId})
       RETURN s.key AS key, s.name AS name, s.kind AS kind, s.path AS path,
              s.language AS language, s.startLine AS startLine, s.endLine AS endLine
       ORDER BY s.key
       LIMIT $limit`,
      { repositoryId, limit: BigInt(limit) },
    );

    // The node query is capped, so the edge query must be scoped to exactly
    // the returned keys. Otherwise d3-force dies with "node not found" on
    // links pointing at symbols outside the cap.
    const keys = nodes.records.map((r) => r.get("key") as string);

    const edges = await session.run(
      `MATCH (a:Symbol {repositoryId: $repositoryId})-[r:RELATES]->(b:Symbol {repositoryId: $repositoryId})
       WHERE a.key IN $keys AND b.key IN $keys
       RETURN a.key AS from, b.key AS to, r.type AS type
       ORDER BY a.key, b.key
       LIMIT $limit`,
      { repositoryId, keys, limit: BigInt(limit) },
    );

    return {
      nodes: nodes.records.map((r) => r.toObject() as SymbolNode),
      edges: edges.records.map((r) => r.toObject() as GraphSnapshot["edges"][number]),
    };
  });
}
