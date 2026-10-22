/**
 * Evaluation maths and run serialization tests.
 *
 * Pure functions only: expected paths are the ground truth, so a regression
 * here would silently report better retrieval quality than the system has.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  computeRetrievalMetrics,
  matchesExpectedPath,
  mean,
  percentile,
  uniquePaths,
} from "../lib/evaluations/metrics.js";
import {
  latestPerQuestion,
  parseRunQuestions,
  summarizeRun,
  type RunQueryRow,
} from "../lib/evaluations/runs.js";

test("expected paths match exactly or by wildcard prefix", () => {
  assert.equal(matchesExpectedPath("src/auth/session.ts", "src/auth/session.ts"), true);
  assert.equal(matchesExpectedPath("./src/auth/session.ts", "src/auth/session.ts"), true);
  assert.equal(matchesExpectedPath("src/auth/session.ts", "src/auth/*"), true);
  assert.equal(matchesExpectedPath("src/author.ts", "src/auth/*"), false);
  assert.equal(matchesExpectedPath("src/auth/session.ts", ""), false);
});

test("unique paths preserve order and remove duplicates", () => {
  assert.deepEqual(uniquePaths(["src/a.ts", "./src/a.ts", "src/b.ts", "src/a.ts"]), [
    "src/a.ts",
    "src/b.ts",
  ]);
});

test("recall, precision and MRR are document-level and use K as denominator", () => {
  const metrics = computeRetrievalMetrics(
    ["src/auth/session.ts", "src/auth/session.ts", "src/db.ts", "src/user.ts"],
    ["src/auth/session.ts", "src/user.ts"],
    4,
  );
  assert.ok(metrics);
  assert.equal(metrics.recallAtK, 1);
  assert.equal(metrics.precisionAtK, 0.5);
  assert.equal(metrics.mrr, 1);
});

test("MRR uses the first relevant rank after deduplication", () => {
  const metrics = computeRetrievalMetrics(["src/a.ts", "src/b.ts", "src/c.ts"], ["src/b.ts"], 3);
  assert.ok(metrics);
  assert.equal(metrics.recallAtK, 1);
  assert.equal(metrics.precisionAtK, 1 / 3);
  assert.equal(metrics.mrr, 0.5);
});

test("wildcard ground truth counts every matching file once", () => {
  const metrics = computeRetrievalMetrics(
    ["src/auth/session.ts", "src/auth/token.ts", "src/other.ts"],
    ["src/auth/*"],
    3,
  );
  assert.ok(metrics);
  assert.equal(metrics.recallAtK, 1);
  assert.equal(metrics.precisionAtK, 2 / 3);
});

test("unlabelled or empty retrieval is honest", () => {
  assert.equal(computeRetrievalMetrics(["src/a.ts"], [], 10), null);
  assert.deepEqual(computeRetrievalMetrics([], ["src/a.ts"], 10), {
    recallAtK: 0,
    precisionAtK: 0,
    mrr: 0,
  });
});

test("mean and percentile handle small samples", () => {
  assert.equal(mean([]), null);
  assert.equal(mean([1, 2, 3]), 2);
  assert.equal(percentile([10, 20, 30, 40], 95), 40);
  assert.equal(percentile([10, 20, 30, 40], 50), 20);
  assert.equal(percentile([], 95), null);
});

test("run questions are sanitized before they become ground truth", () => {
  const parsed = parseRunQuestions([
    { question: "  Where is auth?  ", expectedPaths: ["src/auth/*", "", 42] },
    { question: "", expectedPaths: [] },
    { nope: true },
    { question: "Trace login", expectedPaths: "src/login.ts" },
  ]);
  assert.deepEqual(parsed, [
    { question: "Where is auth?", expectedPaths: ["src/auth/*"] },
    { question: "Trace login", expectedPaths: [] },
  ]);
});

function query(overrides: Partial<RunQueryRow>): RunQueryRow {
  return {
    id: crypto.randomUUID(),
    evaluationRunId: "run-1",
    evalQuestionIndex: 0,
    status: "SUCCESS",
    latencyMs: 100,
    totalTokens: 10,
    costUsd: 0.001,
    sourceCount: 3,
    recallAtK: 1,
    precisionAtK: 0.5,
    mrr: 1,
    faithfulness: 0.9,
    relevance: 0.8,
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

test("a retried question keeps only its latest log row", () => {
  const older = query({
    evalQuestionIndex: 0,
    status: "ERROR",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });
  const newer = query({
    evalQuestionIndex: 0,
    status: "SUCCESS",
    createdAt: new Date("2026-01-01T00:01:00Z"),
  });
  const other = query({ evalQuestionIndex: 1 });
  const deduped = latestPerQuestion([older, newer, other]);
  assert.equal(deduped.length, 2);
  assert.equal(deduped.find((row) => row.evalQuestionIndex === 0)?.status, "SUCCESS");
});

test("run summaries average only rows that actually have each metric", () => {
  const summary = summarizeRun([
    query({ latencyMs: 100, recallAtK: 1, precisionAtK: 0.5, mrr: 1 }),
    query({
      status: "ERROR",
      latencyMs: null,
      recallAtK: null,
      precisionAtK: null,
      mrr: null,
      faithfulness: null,
      relevance: null,
    }),
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.succeeded, 1);
  assert.equal(summary.errors, 1);
  assert.equal(summary.avgLatencyMs, 100);
  assert.equal(summary.avgRecallAtK, 1);
  assert.equal(summary.avgPrecisionAtK, 0.5);
  assert.equal(summary.avgFaithfulness, 0.9);
  assert.equal(summary.avgRelevance, 0.8);
});
