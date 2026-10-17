export {
  chunkKey,
  deduplicateByProximity,
  finalizeResults,
  preferNamedSymbols,
  reciprocalRankFusion,
} from "./fusion.js";
export { groundChunks, hybridSearch, type HybridResult } from "./hybrid.js";
export {
  getLexicalBackend,
  clearInMemory,
  indexInMemory,
  lexicalSearch,
  setLexicalBackend,
  type LexicalBackend,
} from "./lexical.js";
export { deterministicEmbedding, embedQuery, getEmbeddingModel } from "./embeddings.js";
export {
  DEFAULT_BUDGET,
  SYSTEM_PROMPT,
  buildContext,
  renderCitations,
  type BuiltContext,
  type ContextBudget,
  type ContextSource,
} from "./context.js";
export {
  DEFAULT_CANDIDATES,
  DEFAULT_LIMIT,
  RRF_K,
  type ChunkRef,
  type QueryOptions,
  type RankedHit,
  type Retriever,
  type ScoredChunk,
} from "./types.js";
