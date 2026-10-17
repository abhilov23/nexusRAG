/**
 * Lexical (BM25) retrieval.
 *
 * Elasticsearch is the production backend. An in-memory BM25 stands in when
 * Elasticsearch is unreachable so a degraded Qdrant-only deployment still
 * answers from exact identifiers -- losing lexical search silently would be
 * worse than being explicit about the fallback.
 */

import { getSearchClient, CODE_CHUNKS_INDEX } from "@repo/search";

import type { ChunkRef, QueryOptions, RankedHit } from "./types.js";
import { DEFAULT_CANDIDATES } from "./types.js";

export type LexicalBackend = "elasticsearch" | "memory";

let backend: LexicalBackend = "elasticsearch";

export function setLexicalBackend(next: LexicalBackend): void {
  backend = next;
}

export function getLexicalBackend(): LexicalBackend {
  return backend;
}

/** Documents kept for the in-memory fallback, per repository. */
const memoryIndex = new Map<string, Map<string, ChunkRef>>();

export function indexInMemory(repositoryId: string, chunks: ChunkRef[]): void {
  memoryIndex.set(
    repositoryId,
    new Map(chunks.map((chunk) => [`${chunk.path}:${chunk.startLine}`, chunk])),
  );
}

export function clearInMemory(): void {
  memoryIndex.clear();
}

/**
 * Lexical search against Elasticsearch.
 *
 * Boosts an exact `symbol` match above body text: a developer searching
 * `validateAccessToken` wants that function, not every file that mentions it.
 */
export async function lexicalSearch(query: string, options: QueryOptions): Promise<RankedHit[]> {
  const candidates = options.candidatesPerRetriever ?? DEFAULT_CANDIDATES;

  if (backend === "memory") {
    return memorySearch(query, options, candidates);
  }

  try {
    const response = await getSearchClient().search<ChunkRef>({
      index: CODE_CHUNKS_INDEX,
      size: candidates,
      query: {
        bool: {
          filter: [{ terms: { repositoryId: options.repositoryIds } }],
          must: [
            {
              multi_match: {
                query,
                fields: ["symbol^3", "path^2", "imports", "content"],
                type: "best_fields",
              },
            },
          ],
          ...(options.pathPrefix ? { should: [{ prefix: { path: options.pathPrefix } }] } : {}),
        },
      },
    });

    return response.hits.hits.flatMap((hit) => {
      const source = hit._source;
      if (!source) return [];
      return [
        {
          chunk: source,
          score: hit._score ?? 0,
        },
      ];
    });
  } catch {
    // Fall through to the in-memory index rather than failing the whole query.
    setLexicalBackend("memory");
    return memorySearch(query, options, candidates);
  }
}

/**
 * Naive BM25 over the in-memory fallback.
 *
 * Not a performance path -- it exists so lexical search still functions in
 * development and in tests without an Elasticsearch instance.
 */
function memorySearch(query: string, options: QueryOptions, candidates: number): RankedHit[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((term) => term.length > 1);

  if (terms.length === 0) return [];

  const K1 = 1.5;
  const B = 0.75;

  const documents: { chunk: ChunkRef; length: number; tf: Map<string, number> }[] = [];
  for (const repositoryId of options.repositoryIds) {
    for (const chunk of memoryIndex.get(repositoryId)?.values() ?? []) {
      if (options.pathPrefix && !chunk.path.startsWith(options.pathPrefix)) continue;

      const haystack = `${chunk.path} ${chunk.symbol ?? ""} ${chunk.content}`.toLowerCase();
      const tf = new Map<string, number>();
      for (const term of terms) {
        const count = haystack.split(term).length - 1;
        if (count > 0) tf.set(term, count);
      }
      if (tf.size > 0) {
        documents.push({ chunk, length: haystack.length, tf });
      }
    }
  }

  if (documents.length === 0) return [];

  const averageLength = documents.reduce((sum, doc) => sum + doc.length, 0) / documents.length;

  const scored = documents.map((doc) => {
    let score = 0;
    for (const term of terms) {
      const frequency = doc.tf.get(term) ?? 0;
      if (frequency === 0) continue;

      const containing = documents.filter((other) => other.tf.has(term)).length;
      const idf = Math.log(1 + (documents.length - containing + 0.5) / (containing + 0.5));

      const norm =
        (frequency * (K1 + 1)) / (frequency + K1 * (1 - B + (B * doc.length) / averageLength));
      score += idf * norm;
    }
    return { chunk: doc.chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, candidates);
}
