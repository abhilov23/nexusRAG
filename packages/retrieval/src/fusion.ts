/**
 * Result fusion.
 *
 * Pure functions with no service dependencies, so the ranking behaviour that
 * everything else depends on is directly testable.
 */

import { RRF_K, type ChunkRef, type RankedHit, type Retriever, type ScoredChunk } from "./types.js";

/** Stable identity for a chunk across retrievers. */
export function chunkKey(chunk: ChunkRef): string {
  return `${chunk.repositoryId}:${chunk.commitSha}:${chunk.path}:${chunk.startLine}:${chunk.symbol ?? ""}`;
}

/**
 * Reciprocal Rank Fusion.
 *
 * Combines rankings by position rather than by score, which is the whole point:
 * a cosine similarity of 0.82 and an BM25 of 14.3 are not on a common scale, and
 * any attempt to normalise them invents a relationship that is not in the data.
 * Ranks are commensurable by construction.
 *
 * A chunk found by several retrievers accumulates weight from each, so agreement
 * between signals raises it -- which is exactly the behaviour that makes hybrid
 * retrieval beat either signal alone.
 */
export function reciprocalRankFusion(
  ranked: Partial<Record<Retriever, RankedHit[]>>,
  options: { k?: number; limit?: number } = {},
): ScoredChunk[] {
  const k = options.k ?? RRF_K;
  const merged = new Map<string, ScoredChunk>();

  for (const [retriever, hits] of Object.entries(ranked) as [Retriever, RankedHit[]][]) {
    hits.forEach((hit, index) => {
      const rank = index + 1;
      const key = chunkKey(hit.chunk);
      const existing = merged.get(key);

      if (existing) {
        existing.ranks[retriever] = rank;
        existing.rawScores[retriever] = hit.score;
        existing.score += 1 / (k + rank);
        return;
      }

      merged.set(key, {
        chunk: hit.chunk,
        score: 1 / (k + rank),
        ranks: { [retriever]: rank },
        rawScores: { [retriever]: hit.score },
      });
    });
  }

  const fused = [...merged.values()].sort(
    (a, b) => b.score - a.score || a.chunk.path.localeCompare(b.chunk.path),
  );

  return options.limit ? fused.slice(0, options.limit) : fused;
}

/**
 * Encourages results that carry a named symbol over anonymous blocks.
 *
 * A hit in `AuthService.validateToken` is far more useful than an equally-scored
 * bare block, because the answer can point at something the reader can search
 * for. Ties are broken on symbol presence before on path, and never enough to
 * override a genuine score difference.
 */
export function preferNamedSymbols(results: ScoredChunk[]): ScoredChunk[] {
  const top = results[0]?.score ?? 0;
  // Small enough that it cannot invert the order of two clearly-different hits.
  const bonus = top * 0.02;

  return [...results]
    .map((result) => (result.chunk.symbol ? { ...result, score: result.score + bonus } : result))
    .sort((a, b) => b.score - a.score || a.chunk.path.localeCompare(b.chunk.path));
}

/**
 * Drops near-duplicate chunks.
 *
 * Chunking overlaps slightly (a docstring can precede the definition it
 * documents), so the same code can be returned twice at adjacent line offsets.
 * Keeping both wastes context budget and makes citations look confused.
 */
export function deduplicateByProximity(results: ScoredChunk[], toleranceLines = 3): ScoredChunk[] {
  const byFile = new Map<string, ScoredChunk[]>();
  const kept: ScoredChunk[] = [];

  for (const result of results) {
    const file = `${result.chunk.repositoryId}:${result.chunk.path}`;
    const siblings = byFile.get(file) ?? [];

    const overlap = siblings.some(
      (other) => Math.abs(other.chunk.startLine - result.chunk.startLine) <= toleranceLines,
    );

    if (overlap) continue;

    siblings.push(result);
    byFile.set(file, siblings);
    kept.push(result);
  }

  return kept;
}

/** Applies the standard post-fusion pipeline in the right order. */
export function finalizeResults(fused: ScoredChunk[], limit: number): ScoredChunk[] {
  return preferNamedSymbols(deduplicateByProximity(fused)).slice(0, limit);
}
