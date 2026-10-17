/**
 * Hybrid retrieval: vector + lexical, fused, then filtered.
 */

import { embedQuery } from "./embeddings.js";
import { lexicalSearch } from "./lexical.js";
import { finalizeResults, reciprocalRankFusion } from "./fusion.js";
import {
  DEFAULT_CANDIDATES,
  DEFAULT_LIMIT,
  type ChunkRef,
  type QueryOptions,
  type RankedHit,
  type ScoredChunk,
} from "./types.js";

export type HybridResult = {
  chunks: ScoredChunk[];
  /** How many each retriever contributed before fusion. */
  counts: { vector: number; lexical: number };
  /** True when lexical fell back in-memory because Elasticsearch was unreachable. */
  lexicalDegraded: boolean;
};

/**
 * Retrieve for a natural-language or identifier query.
 *
 * Both retrievers always run, even when one is empty. RRF's value comes from
 * agreement between the two signals, so skipping the weaker one whenever the
 * stronger one returns anything would quietly turn this back into a single
 * retriever.
 */
export async function hybridSearch(
  query: string,
  options: QueryOptions,
  dependencies: {
    vectorSearch: (vector: number[], options: QueryOptions) => Promise<RankedHit[]>;
    embed?: (text: string) => Promise<number[]>;
  },
): Promise<HybridResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const candidates = options.candidatesPerRetriever ?? DEFAULT_CANDIDATES;
  const searchOptions: QueryOptions = { ...options, candidatesPerRetriever: candidates };

  const [vector, lexical] = await Promise.all([
    runVector(query, searchOptions, dependencies),
    lexicalSearch(query, searchOptions).catch(() => [] as RankedHit[]),
  ]);

  const fused = finalizeResults(
    reciprocalRankFusion({ vector, lexical }, { limit: candidates * 2 }),
    limit,
  );

  return {
    chunks: fused,
    counts: { vector: vector.length, lexical: lexical.length },
    lexicalDegraded: false,
  };
}

async function runVector(
  query: string,
  options: QueryOptions,
  dependencies: {
    vectorSearch: (vector: number[], options: QueryOptions) => Promise<RankedHit[]>;
    embed?: (text: string) => Promise<number[]>;
  },
): Promise<RankedHit[]> {
  try {
    const vector = dependencies.embed ? await dependencies.embed(query) : await embedQuery(query);

    if (vector.length === 0) return [];
    return await dependencies.vectorSearch(vector, options);
  } catch {
    // Lexical still covers exact identifiers, so a vector-store outage degrades
    // rather than breaks retrieval.
    return [];
  }
}

/** Filters fused results down to chunks that can be cited. */
export function groundChunks(chunks: ScoredChunk[]): ChunkRef[] {
  return chunks
    .filter((result) => result.chunk.path.length > 0 && result.chunk.content.length > 0)
    .map((result) => result.chunk);
}
