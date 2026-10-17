/**
 * Context construction.
 *
 * The goal is the smallest amount of code that lets the model answer correctly.
 * Chunks are packed against a real token budget rather than a character
 * heuristic, because tokens are what the model's window actually counts.
 */

import type { ChunkRef, ScoredChunk } from "./types.js";

export type ContextBudget = {
  /** Hard ceiling on prompt tokens. */
  maxTokens: number;
  /** Tokens reserved for the answer itself. */
  answerTokens: number;
};

export const DEFAULT_BUDGET: ContextBudget = {
  maxTokens: 120_000,
  answerTokens: 2_000,
};

export type BuiltContext = {
  text: string;
  /** Citations referenced by the prompt, in order. */
  sources: ContextSource[];
  estimatedTokens: number;
  /** Chunks dropped because the budget ran out. */
  dropped: number;
};

export type ContextSource = {
  index: number;
  repositoryId: string;
  path: string;
  startLine: number;
  endLine: number;
  symbol: string | null;
  language: string;
};

/**
 * Token estimate.
 *
 * Uses the cl100k_base vocabulary the current embedding and chat models use.
 * It is loaded lazily and falls back to a character ratio if unavailable, so
 * context building never hard-fails on a tiktoken problem.
 */
let encoder: { encode(text: string): unknown[] } | null | undefined;

async function countTokens(text: string): Promise<number> {
  if (encoder === undefined) {
    try {
      // `encodingForModel`, not Python's `encoding_for_model`.
      const { encodingForModel } = await import("js-tiktoken");
      encoder = encodingForModel("gpt-4");
    } catch {
      encoder = null;
    }
  }

  if (encoder) return encoder.encode(text).length;

  // ~4 characters per token for code, which is close enough for budgeting.
  return Math.ceil(text.length / 4);
}

/**
 * Packs the highest-scored chunks that fit.
 *
 * Iterative rather than greedy-per-chunk: a single enormous file must not be
 * able to consume the entire budget and starve everything else, so any chunk
 * larger than a quarter of the budget is skipped outright.
 */
export async function buildContext(
  results: ScoredChunk[],
  budget: ContextBudget = DEFAULT_BUDGET,
): Promise<BuiltContext> {
  const available = Math.max(0, budget.maxTokens - budget.answerTokens);
  const perChunkCeiling = Math.floor(available / 4);

  const included: { chunk: ChunkRef; text: string }[] = [];
  const sources: ContextSource[] = [];
  let used = 0;
  let dropped = 0;

  for (const result of results) {
    const text = result.chunk.content;

    // Cheap pre-filter before paying for tokenization.
    //
    // Even the most generous characters-per-token ratio (~2 for code) proves a
    // chunk cannot fit, so it is dropped without encoding it. Without this, one
    // generated megabyte file makes context building hang on tokenization alone.
    if (text.length / 2 > available || text.length / 2 > perChunkCeiling) {
      dropped += 1;
      continue;
    }

    const estimated = await countTokens(text);
    if (estimated > perChunkCeiling) {
      dropped += 1;
      continue;
    }

    if (used + estimated > available) {
      dropped += 1;
      continue;
    }

    used += estimated;
    const index = included.length + 1;
    included.push({ chunk: result.chunk, text });
    sources.push({
      index,
      repositoryId: result.chunk.repositoryId,
      path: result.chunk.path,
      startLine: result.chunk.startLine,
      endLine: result.chunk.endLine,
      symbol: result.chunk.symbol,
      language: result.chunk.language,
    });
  }

  const body = included
    .map((entry, i) =>
      [
        `<source id="${i + 1}" path="${entry.chunk.path}" lines="${entry.chunk.startLine}-${entry.chunk.endLine}"${entry.chunk.symbol ? ` symbol="${entry.chunk.symbol}"` : ""}>`,
        entry.text,
        "</source>",
      ].join("\n"),
    )
    .join("\n\n");

  return {
    text: body,
    sources,
    estimatedTokens: used,
    dropped,
  };
}

/**
 * The instruction block.
 *
 * Kept separate from the retrieved text so the prompt structure is reviewable on
 * its own, and so the "only use these sources" constraint is impossible to lose
 * in a refactor of the packing code.
 */
export const SYSTEM_PROMPT = `You are NexusRAG, answering questions about a codebase.

Rules:
- Answer only from the <source> blocks provided. They are the retrieved code.
- Cite every claim with the source id and path, like [3] or [3: src/auth.ts].
- If the sources do not contain the answer, say so plainly and name what is missing.
- Never invent file paths, symbols, or behaviour that is not in the sources.
- Be concise. Quote the relevant code rather than describing it vaguely.`;

/** Renders sources for the client to display as citations. */
export function renderCitations(sources: ContextSource[]): string[] {
  return sources.map(
    (source) =>
      `${source.path}:${source.startLine}-${source.endLine}${source.symbol ? ` · ${source.symbol}` : ""}`,
  );
}

export type { ChunkRef };
