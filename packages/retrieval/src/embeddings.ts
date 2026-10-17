import { createHash } from "node:crypto";

/**
 * Query embedding.
 *
 * Retrieval and indexing must use the *same* model, or the vectors in Qdrant
 * are in a different space than the query vector and every search returns noise.
 * The model is therefore resolved once, here, and the indexer imports it from
 * the same place.
 *
 * The vendor is chosen in configuration, not code: any endpoint implementing
 * the OpenAI API works, so LLM_BASE_URL / EMBEDDING_BASE_URL can point anywhere.
 */

let cached: number[] | null = null;

const MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

export function getEmbeddingModel(): string {
  return MODEL;
}

function embeddingConfig() {
  return {
    baseUrl: (
      process.env.EMBEDDING_BASE_URL ||
      process.env.LLM_BASE_URL ||
      "https://api.openai.com/v1"
    ).replace(/\/$/, ""),
    apiKey: process.env.EMBEDDING_API_KEY || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY,
  };
}

/**
 * Embeds a query string.
 *
 * Falls back to a deterministic projection when no API key is configured, so
 * development and tests work without credentials. Those vectors are stable but
 * not semantic -- retrieval quality in that mode is meaningless, which is why
 * the ai-service logs a warning when it selects the fallback.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const { baseUrl, apiKey } = embeddingConfig();

  if (!apiKey) {
    return deterministicEmbedding(text);
  }

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: MODEL, input: text }),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    data: { embedding: number[] }[];
  };
  cached = payload.data[0]?.embedding ?? [];
  return cached;
}

/**
 * Hash-based projection, matching ai_service.embedding.DeterministicEmbeddings.
 *
 * Kept byte-compatible with the Python implementation so a repository indexed
 * in fallback mode can still be queried in fallback mode.
 */
export function deterministicEmbedding(text: string, dimensions = 1536): number[] {
  const values: number[] = [];
  let counter = 0;

  while (values.length < dimensions) {
    // Synchronous on purpose: this must stay a pure function so it can be unit
    // tested without awaiting, and so it matches the Python fallback exactly.
    const digest = createHash("sha256").update(`${counter}:${text}`).digest();
    for (const byte of digest) {
      if (values.length === dimensions) break;
      values.push(byte / 127.5 - 1.0);
    }
    counter += 1;
  }

  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => value / norm);
}
