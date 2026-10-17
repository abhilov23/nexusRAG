/**
 * Context packing and end-to-end hybrid retrieval, both running entirely
 * in-process so neither needs a live Qdrant or Elasticsearch.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildContext,
  DEFAULT_BUDGET,
  SYSTEM_PROMPT,
  renderCitations,
  type ScoredChunk,
} from "../src/context.js";
import { clearInMemory, indexInMemory, lexicalSearch, setLexicalBackend } from "../src/lexical.js";
import { hybridSearch } from "../src/hybrid.js";
import { deterministicEmbedding } from "../src/embeddings.js";
import type { ChunkRef } from "../src/types.js";

function chunk(overrides: Partial<ChunkRef>): ChunkRef {
  return {
    repositoryId: "repo",
    commitSha: "abc",
    path: "src/auth.ts",
    language: "typescript",
    symbol: "validateToken",
    kind: "function_definition",
    startLine: 10,
    endLine: 20,
    content: "function validateToken(token) { return verify(token); }",
    ...overrides,
  };
}

function scored(c: ChunkRef, score: number): ScoredChunk {
  return { chunk: c, score, ranks: {}, rawScores: {} };
}

test("context packs the highest scored chunks first and stays within budget", async () => {
  const results = [
    scored(chunk({ path: "a.ts", startLine: 1 }), 0.9),
    scored(chunk({ path: "b.ts", startLine: 1 }), 0.8),
    scored(chunk({ path: "c.ts", startLine: 1 }), 0.7),
  ];

  const built = await buildContext(results, { maxTokens: 200, answerTokens: 50 });

  assert.equal(built.sources.length, 3);
  assert.equal(built.sources[0]?.path, "a.ts");
  assert.ok(built.estimatedTokens < 150, "must respect the budget");
  assert.match(built.text, /path="a\.ts"/);
  assert.match(built.text, /path="b\.ts"/);
});

test("a chunk too large for its share of the budget is dropped, not truncated", async () => {
  const huge = chunk({ path: "huge.ts", content: "x".repeat(400_000) });
  const small = chunk({ path: "small.ts", startLine: 1 });

  const built = await buildContext([scored(huge, 0.9), scored(small, 0.8)], {
    maxTokens: 400,
    answerTokens: 100,
  });

  assert.equal(built.sources.length, 1);
  assert.equal(built.sources[0]?.path, "small.ts");
  assert.equal(built.dropped, 1);
});

test("sources carry line ranges so answers can cite them", async () => {
  const built = await buildContext(
    [scored(chunk({ path: "src/a.ts", startLine: 12, endLine: 40, symbol: "run" }), 1)],
    DEFAULT_BUDGET,
  );

  assert.deepEqual(built.sources[0], {
    index: 1,
    repositoryId: "repo",
    path: "src/a.ts",
    startLine: 12,
    endLine: 40,
    symbol: "run",
    language: "typescript",
  });

  assert.deepEqual(renderCitations(built.sources), ["src/a.ts:12-40 · run"]);
});

test("the system prompt forbids unsupported claims", () => {
  assert.match(SYSTEM_PROMPT, /only from the <source>/i);
  assert.match(SYSTEM_PROMPT, /cite/i);
});

test("lexical search finds an exact identifier", async () => {
  setLexicalBackend("memory");
  clearInMemory();
  indexInMemory("repo", [
    chunk({ path: "src/auth.ts", symbol: "validateAccessToken" }),
    chunk({ path: "src/db.ts", symbol: "connectToDatabase", content: "connect()" }),
  ]);

  const hits = await lexicalSearch("validateAccessToken", { repositoryIds: ["repo"] });

  assert.ok(hits.length > 0);
  assert.equal(hits[0]?.chunk.path, "src/auth.ts");
});

test("lexical search is scoped to the requested repositories", async () => {
  setLexicalBackend("memory");
  clearInMemory();
  indexInMemory("repo-a", [chunk({ path: "a.ts", symbol: "shared" })]);
  indexInMemory("repo-b", [chunk({ path: "b.ts", symbol: "shared" })]);

  const hits = await lexicalSearch("shared", { repositoryIds: ["repo-b"] });
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.chunk.path, "b.ts");
});

test("hybrid search fuses both retrievers and degrades when vector fails", async () => {
  setLexicalBackend("memory");
  clearInMemory();
  indexInMemory("repo", [chunk({ path: "src/auth.ts", symbol: "validateToken" })]);

  // Vector store throws: lexical alone must still produce an answer.
  const result = await hybridSearch(
    "validateToken",
    { repositoryIds: ["repo"] },
    {
      embed: async () => deterministicEmbedding("validateToken"),
      vectorSearch: async () => {
        throw new Error("qdrant unavailable");
      },
    },
  );

  assert.equal(result.counts.vector, 0);
  assert.equal(result.counts.lexical, 1);
  assert.equal(result.chunks[0]?.chunk.path, "src/auth.ts");
});

test("hybrid search prefers what both retrievers agree on", async () => {
  setLexicalBackend("memory");
  clearInMemory();
  const agreed = chunk({ path: "src/auth.ts", symbol: "validateToken" });
  const vectorOnly = chunk({ path: "src/other.ts", symbol: "unrelated" });

  indexInMemory("repo", [agreed]);

  const result = await hybridSearch(
    "validateToken",
    { repositoryIds: ["repo"] },
    {
      embed: async () => deterministicEmbedding("validateToken"),
      // Deliberately ranks the disagreeing chunk first in vector space.
      vectorSearch: async () => [hit(vectorOnly, 0.99), hit(agreed, 0.5)],
    },
  );

  const paths = result.chunks.map((c) => c.chunk.path);
  assert.equal(paths[0], "src/auth.ts", "agreement should outrank one strong signal");
});

function hit(c: ChunkRef, score: number) {
  return { chunk: c, score };
}
