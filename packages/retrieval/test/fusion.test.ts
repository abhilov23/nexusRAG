/**
 * Fusion behaviour.
 *
 * These are the rules the whole retrieval path depends on, so they are pinned
 * down here rather than discovered later through bad answers.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chunkKey,
  deduplicateByProximity,
  finalizeResults,
  preferNamedSymbols,
  reciprocalRankFusion,
  type RankedHit,
} from "../src/fusion.js";
import type { ChunkRef, ScoredChunk } from "../src/types.js";

function chunk(overrides: Partial<ChunkRef> = {}): ChunkRef {
  return {
    repositoryId: "repo",
    commitSha: "abc",
    path: "src/auth.ts",
    language: "typescript",
    symbol: "validateToken",
    kind: "function_definition",
    startLine: 10,
    endLine: 20,
    content: "function validateToken() {}",
    ...overrides,
  };
}

function hit(c: ChunkRef, score: number): RankedHit {
  return { chunk: c, score };
}

function scored(c: ChunkRef, score: number, path?: string): ScoredChunk {
  return { chunk: c, score, ranks: {}, rawScores: {} };
}

test("chunk identity ignores score but not location", () => {
  assert.equal(chunkKey(chunk()), chunkKey(chunk({ content: "different" })));
  assert.notEqual(chunkKey(chunk()), chunkKey(chunk({ startLine: 11 })));
  assert.notEqual(chunkKey(chunk()), chunkKey(chunk({ path: "src/other.ts" })));
  assert.notEqual(chunkKey(chunk()), chunkKey(chunk({ symbol: "other" })));
});

test("fusion is rank-based, so incomparable scores do not distort it", () => {
  // Lexical scores are BM25-scale, vector scores are cosine. A naive sum would
  // let the BM25 list dominate entirely.
  const fused = reciprocalRankFusion({
    vector: [hit(chunk({ path: "a.ts" }), 0.99), hit(chunk({ path: "b.ts" }), 0.98)],
    lexical: [hit(chunk({ path: "b.ts" }), 42), hit(chunk({ path: "c.ts" }), 9)],
  });

  assert.equal(fused[0]?.chunk.path, "b.ts", "agreement between both should win");
});

test("a chunk found by both retrievers beats one found by a single retriever", () => {
  const shared = chunk({ path: "shared.ts" });
  const fused = reciprocalRankFusion({
    vector: [hit(shared, 1), hit(chunk({ path: "only-vector.ts" }), 0.9)],
    lexical: [hit(shared, 5)],
  });

  assert.equal(fused[0]?.chunk.path, "shared.ts");
  assert.equal(fused[0]?.ranks.vector, 1);
  assert.equal(fused[0]?.ranks.lexical, 1);
  assert.equal(fused.length, 2, "must deduplicate the shared chunk");
});

test("rank 1 is worth more than rank 2 regardless of raw score", () => {
  const fused = reciprocalRankFusion({
    vector: [hit(chunk({ path: "first.ts" }), 0.1), hit(chunk({ path: "second.ts" }), 9999)],
  });

  assert.equal(fused[0]?.chunk.path, "first.ts");
});

test("an empty retriever does not break fusion", () => {
  const fused = reciprocalRankFusion({
    vector: [hit(chunk({ path: "a.ts" }), 0.9)],
    lexical: [],
  });
  assert.equal(fused.length, 1);
  assert.equal(fused[0]?.chunk.path, "a.ts");
});

test("fusion with no retrievers returns nothing", () => {
  assert.deepEqual(reciprocalRankFusion({}), []);
});

test("limit is respected", () => {
  const many = Array.from({ length: 50 }, (_, i) =>
    hit(chunk({ path: `f${i}.ts`, startLine: i + 1 }), 1 - i / 100),
  );
  assert.equal(reciprocalRankFusion({ vector: many }, { limit: 5 }).length, 5);
});

test("near-duplicate chunks are collapsed, distant ones are not", () => {
  const results = [
    scored(chunk({ path: "a.ts", startLine: 10 }), 0.9),
    // Same file, adjacent line: an overlapping docstring, not a distinct hit.
    scored(chunk({ path: "a.ts", startLine: 12 }), 0.8),
    scored(chunk({ path: "b.ts", startLine: 10 }), 0.7),
  ];

  const deduped = deduplicateByProximity(results);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0]?.chunk.path, "a.ts");
});

test("named symbols are preferred, but not over a clearly better score", () => {
  const strongAnonymous = scored(chunk({ path: "high.ts", symbol: null }), 1.0);
  const weakNamed = scored(chunk({ path: "low.ts", symbol: "handleAuth" }), 0.5);

  const reordered = preferNamedSymbols([strongAnonymous, weakNamed]);
  assert.equal(reordered[0]?.chunk.path, "high.ts", "a 2% nudge must not invert a large score gap");

  const tied = preferNamedSymbols([
    scored(chunk({ path: "a.ts", symbol: null }), 1.0),
    scored(chunk({ path: "b.ts", symbol: "handleAuth" }), 0.999),
  ]);
  assert.equal(tied[0]?.chunk.path, "b.ts", "should win on an otherwise even match");
});

test("finalize applies dedup then symbol preference then the limit", () => {
  const results = [
    scored(chunk({ path: "dup.ts", startLine: 5, symbol: null }), 0.9),
    scored(chunk({ path: "dup.ts", startLine: 6, symbol: null }), 0.89),
    ...Array.from({ length: 10 }, (_, i) =>
      scored(chunk({ path: `x${i}.ts`, startLine: i + 1, symbol: `fn${i}` }), 0.5 - i / 100),
    ),
  ];

  const final = finalizeResults(results, 5);
  assert.equal(final.length, 5);
  assert.equal(final[0]?.chunk.path, "dup.ts", "the duplicate pair collapses to one");
});
