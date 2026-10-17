/**
 * Elasticsearch client for lexical code search.
 *
 * Hybrid retrieval needs this alongside the vector store: embeddings find code
 * that *means* something similar, but developers search for exact identifiers
 * like `validateAccessToken`, and only lexical search reliably matches those.
 *
 * Handles both self-hosted Elasticsearch and Elastic Cloud, which differ in
 * scheme, port, and how credentials are presented.
 */

import { Client } from "@elastic/elasticsearch";

export interface SearchConfig {
  url: string;
  apiKey?: string | undefined;
  username?: string | undefined;
  password?: string | undefined;
  /** Elastic Cloud and most managed providers require TLS; plain HTTP is opt-in. */
  rejectUnauthorized?: boolean | undefined;
}

let client: Client | undefined;

/**
 * Builds the client from environment values.
 *
 * Cloud note: Elastic Cloud hands out a base64 `ApiKey`. Supplying `username`
 * and `password` instead also works, but the API key is the supported path and
 * is what rotates cleanly.
 */
export function getSearchClient(): Client {
  if (client) return client;

  const url = process.env.ELASTICSEARCH_URL;
  if (!url) {
    throw new Error("ELASTICSEARCH_URL is not defined");
  }

  const apiKey = process.env.ELASTICSEARCH_API_KEY;
  const username = process.env.ELASTICSEARCH_USERNAME;
  const password = process.env.ELASTICSEARCH_PASSWORD;

  // Narrow the union so the empty case is never passed to the client.
  const auth: { apiKey: string } | { username: string; password: string } | null = apiKey
    ? { apiKey }
    : username && password
      ? { username, password }
      : null;

  // A self-signed or provider-issued certificate should not be silently
  // trusted; this defaults to strict and can be relaxed deliberately.
  const rejectUnauthorized = process.env.ELASTICSEARCH_REJECT_UNAUTHORIZED !== "false";

  client = new Client({
    node: url,
    ...(auth ? { auth } : {}),
    tls: { rejectUnauthorized },
    maxRetries: 3,
    requestTimeout: 30_000,
  });

  return client;
}

export const CODE_CHUNKS_INDEX = process.env.ELASTICSEARCH_INDEX || "code_chunks";

/**
 * Mapping for the code-chunk index.
 *
 * `path` and `symbol` use keyword fields: they are filtered on exactly, not
 * searched as prose. `content` is analysed so identifiers survive tokenisation.
 * The explicit analyzer settings keep chunk text findable without needing an
 * index template to exist first.
 */
export const CODE_CHUNKS_MAPPING = {
  settings: {
    analysis: {
      analyzer: {
        code_analyzer: {
          type: "custom",
          tokenizer: "standard",
          filter: ["lowercase", "asciifolding"],
        },
      },
      filter: {
        // Splits camelCase and snake_case so `getUserById` is also findable as
        // "user", which plain standard tokenisation would miss entirely.
        code_shingles: {
          type: "word_delimiter_graph",
          generate_word_parts: true,
          generate_number_parts: true,
          catenate_words: true,
          catenate_numbers: true,
          split_on_case_change: true,
        },
      },
    },
  },
  mappings: {
    properties: {
      repositoryId: { type: "keyword" },
      commitSha: { type: "keyword" },
      path: {
        type: "text",
        analyzer: "code_analyzer",
        fields: { keyword: { type: "keyword" } },
      },
      language: { type: "keyword" },
      symbol: {
        type: "text",
        analyzer: "code_analyzer",
        fields: { keyword: { type: "keyword" } },
      },
      kind: { type: "keyword" },
      startLine: { type: "integer" },
      endLine: { type: "integer" },
      imports: { type: "text", analyzer: "code_analyzer" },
      content: { type: "text", analyzer: "code_analyzer" },
    },
  },
} as const;

/** Creates the index if absent. Safe to call on every boot. */
export async function ensureCodeChunksIndex(target: Client = getSearchClient()): Promise<void> {
  const exists = await target.indices.exists({ index: CODE_CHUNKS_INDEX });
  if (exists) return;

  await target.indices.create({ index: CODE_CHUNKS_INDEX, ...CODE_CHUNKS_MAPPING });
}

/** Cheap liveness probe used by the env doctor and readiness checks. */
export async function pingSearch(): Promise<boolean> {
  try {
    await getSearchClient().ping();
    return true;
  } catch {
    return false;
  }
}
