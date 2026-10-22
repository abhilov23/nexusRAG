/**
 * Retrieval evaluation maths.
 *
 * Kept free of Prisma and HTTP so the same functions can be unit-tested and
 * reused by the benchmark completion path. Metrics are computed against
 * user-supplied expected file paths, never against model output.
 */

export type RetrievalMetrics = {
  recallAtK: number;
  precisionAtK: number;
  mrr: number;
};

function normalizePath(path: string): string {
  return path.trim().replace(/^\.?\//, "");
}

/**
 * Exact path, or a prefix when the expected path ends in `*`.
 * `src/auth/*` matches `src/auth/session.ts`, not `src/author.ts`.
 */
export function matchesExpectedPath(path: string, expected: string): boolean {
  const candidate = normalizePath(path);
  const pattern = normalizePath(expected);
  if (!pattern) return false;
  if (pattern.endsWith("*")) {
    return candidate.startsWith(pattern.slice(0, -1));
  }
  return candidate === pattern;
}

export function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const normalized = normalizePath(path);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(path);
  }
  return result;
}

/**
 * Document-level Recall@K, Precision@K and MRR.
 *
 * Precision uses K as the denominator, the standard definition: returning
 * fewer than K chunks does not inflate precision. Paths are deduplicated so a
 * file split into several chunks counts once.
 */
export function computeRetrievalMetrics(
  retrievedPaths: string[],
  expectedPaths: string[],
  k: number,
): RetrievalMetrics | null {
  const expected = Array.from(
    new Set(expectedPaths.map(normalizePath).filter((path) => path.length > 0)),
  );
  if (expected.length === 0 || k <= 0) return null;

  const top = uniquePaths(retrievedPaths).slice(0, k);
  if (top.length === 0) {
    return { recallAtK: 0, precisionAtK: 0, mrr: 0 };
  }

  const isRelevant = (path: string) =>
    expected.some((candidate) => matchesExpectedPath(path, candidate));

  const matchedExpected = expected.filter((candidate) =>
    top.some((path) => matchesExpectedPath(path, candidate)),
  ).length;
  const relevantRetrieved = top.filter(isRelevant).length;
  const firstRelevant = top.findIndex(isRelevant);

  return {
    recallAtK: matchedExpected / expected.length,
    precisionAtK: relevantRetrieved / k,
    mrr: firstRelevant >= 0 ? 1 / (firstRelevant + 1) : 0,
  };
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Nearest-rank percentile. Stable for the small samples this dashboard sees. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}
