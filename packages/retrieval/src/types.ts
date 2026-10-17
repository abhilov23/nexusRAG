/**
 * Retrieval types.
 *
 * A result is always grounded: it points at a real path and line range in a
 * specific commit, because an answer that cannot be checked is not grounded.
 */

export type ChunkRef = {
  repositoryId: string;
  commitSha: string;
  path: string;
  language: string;
  symbol: string | null;
  kind: string;
  startLine: number;
  endLine: number;
  content: string;
  imports?: string[];
};

/** Which retriever produced a hit. */
export type Retriever = "vector" | "lexical" | "graph";

export type ScoredChunk = {
  chunk: ChunkRef;
  /** Fused score, comparable across retrievers only after fusion. */
  score: number;
  /** Rank in each retriever that returned it. Missing means not returned. */
  ranks: Partial<Record<Retriever, number>>;
  /** Original scores before fusion, for debugging. */
  rawScores: Partial<Record<Retriever, number>>;
};

/** One hit from a single retriever, before fusion. */
export type RankedHit = {
  chunk: ChunkRef;
  /** The retriever's own score. Not comparable across retrievers. */
  score: number;
};

export type QueryOptions = {
  repositoryIds: string[];
  limit?: number;
  /** Candidates pulled per retriever before fusion. Higher = better recall. */
  candidatesPerRetriever?: number;
  /** Restrict to these paths, e.g. when the user has a file open. */
  pathPrefix?: string | undefined;
};

export const DEFAULT_LIMIT = 12;
export const DEFAULT_CANDIDATES = 60;

/**
 * RRF constant.
 *
 * 60 is the value from the original Cormack et al. paper: high enough that a
 * result ranked 1st in one list is not overwhelmingly favoured over a result
 * ranked 1st in two lists, which is the behaviour we want.
 */
export const RRF_K = 60;
