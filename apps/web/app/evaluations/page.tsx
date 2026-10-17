"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FlaskConical, LoaderCircle, Play, Plus, Square, Trash2, X } from "lucide-react";
import { AppLayout } from "@/app/components/AppLayout";
import { PageHeader, EmptyState, Stat } from "@/components/ui/sections";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { listRepositories, type Repository } from "@/lib/repositories/client";

/**
 * Evaluation harness for retrieval quality.
 *
 * A run sends a fixed question set through the production /api/ask endpoint
 * against one READY repository and measures latency, grounding and citation
 * counts. Runs are stored in localStorage so history survives reloads.
 */

const DEFAULT_QUESTIONS = [
  "Where is authentication implemented?",
  "Trace what happens when POST /api/login is called.",
  "What depends on UserService?",
  "Where would I need to make changes to add OAuth authentication?",
  "Explain how the payment processing pipeline works.",
  "What are the most important modules in this repository?",
];

const STORAGE_KEY = "nexus-eval-runs-v1";
const QUESTIONS_KEY = "nexus-eval-questions-v1";
const MAX_RUNS = 10;

type EvalResult = {
  question: string;
  ok: boolean;
  latencyMs: number | null;
  grounded: boolean;
  sources: number;
  answerChars: number;
  error: string | null;
};

type EvalSummary = {
  total: number;
  succeeded: number;
  avgLatencyMs: number | null;
  maxLatencyMs: number | null;
  citationRate: number;
  groundedRate: number;
};

type EvalRun = {
  id: string;
  at: number;
  repoId: string;
  repoName: string;
  results: EvalResult[];
  summary: EvalSummary;
};

function summarize(results: EvalResult[]): EvalSummary {
  const ok = results.filter((r) => r.ok);
  const latencies = ok.map((r) => r.latencyMs).filter((n): n is number => typeof n === "number");
  const cited = ok.filter((r) => r.sources > 0).length;
  const grounded = ok.filter((r) => r.grounded).length;
  return {
    total: results.length,
    succeeded: ok.length,
    avgLatencyMs:
      latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null,
    maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : null,
    citationRate: ok.length > 0 ? cited / ok.length : 0,
    groundedRate: ok.length > 0 ? grounded / ok.length : 0,
  };
}

function loadQuestions(): string[] {
  try {
    const raw = localStorage.getItem(QUESTIONS_KEY);
    if (!raw) return [...DEFAULT_QUESTIONS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_QUESTIONS];
    const cleaned = parsed.filter((q): q is string => typeof q === "string" && q.trim().length > 0);
    return cleaned.length > 0 ? cleaned : [...DEFAULT_QUESTIONS];
  } catch {
    return [...DEFAULT_QUESTIONS];
  }
}

function loadRuns(): EvalRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EvalRun[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RUNS) : [];
  } catch {
    return [];
  }
}

function formatLatency(ms: number | null): string {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export default function EvaluationsPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [repoId, setRepoId] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [runs, setRuns] = useState<EvalRun[]>(() =>
    typeof window === "undefined" ? [] : loadRuns(),
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  // Relevance is the operator's call, not ours: a fixed set cannot know which
  // questions fit a given repository, so the set is editable and persisted.
  const [questions, setQuestions] = useState<string[]>(() =>
    typeof window === "undefined" ? [...DEFAULT_QUESTIONS] : loadQuestions(),
  );
  const [draft, setDraft] = useState("");
  const cancelRef = useRef(false);

  const persistQuestions = useCallback((next: string[]) => {
    setQuestions(next);
    try {
      localStorage.setItem(QUESTIONS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable -- questions still hold for this session */
    }
  }, []);

  const addQuestion = useCallback(() => {
    const text = draft.trim();
    if (!text || running) return;
    persistQuestions([...questions, text]);
    setDraft("");
  }, [draft, running, questions, persistQuestions]);

  const removeQuestion = useCallback(
    (index: number) => {
      if (running) return;
      persistQuestions(questions.filter((_, i) => i !== index));
    },
    [running, questions, persistQuestions],
  );

  useEffect(() => {
    let active = true;
    listRepositories()
      .then((rows) => {
        if (!active) return;
        const ready = rows.filter((r) => r.status === "READY");
        setRepositories(ready);
        setRepoId((current) => current || ready[0]?.id || "");
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setReposLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const persistRuns = useCallback((next: EvalRun[]) => {
    setRuns(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, MAX_RUNS)));
    } catch {
      /* storage full or unavailable -- runs still show for this session */
    }
  }, []);

  const runEvaluation = useCallback(async () => {
    const repo = repositories.find((r) => r.id === repoId);
    if (!repo || running || questions.length === 0) return;
    cancelRef.current = false;
    setRunning(true);
    const results: EvalResult[] = [];
    const repoName = `${repo.owner} / ${repo.name}`;
    const set = [...questions];
    for (let i = 0; i < set.length; i += 1) {
      const question = set[i] ?? "";
      setProgress({ done: i, total: set.length, current: question });
      if (cancelRef.current) break;
      const startedAt = performance.now();
      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ question, repositoryIds: [repo.id], limit: 10 }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          answer?: string;
          grounded?: boolean;
          sources?: unknown[];
          message?: string;
        };
        if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
        results.push({
          question,
          ok: true,
          latencyMs: Math.round(performance.now() - startedAt),
          grounded: payload.grounded === true,
          sources: Array.isArray(payload.sources) ? payload.sources.length : 0,
          answerChars: typeof payload.answer === "string" ? payload.answer.length : 0,
          error: null,
        });
      } catch (error) {
        results.push({
          question,
          ok: false,
          latencyMs: null,
          grounded: false,
          sources: 0,
          answerChars: 0,
          error: error instanceof Error ? error.message : "Request failed",
        });
      }
      if (cancelRef.current) break;
    }
    const run: EvalRun = {
      id: `${Date.now()}`,
      at: Date.now(),
      repoId: repo.id,
      repoName,
      results,
      summary: summarize(results),
    };
    persistRuns([run, ...runs].slice(0, MAX_RUNS));
    setActiveRunId(run.id);
    setProgress({ done: results.length, total: set.length, current: "" });
    setRunning(false);
  }, [repositories, repoId, running, runs, persistRuns, questions]);

  const deleteRun = useCallback(
    (id: string) => {
      const next = runs.filter((r) => r.id !== id);
      persistRuns(next);
      setActiveRunId((current) => (current === id ? (next[0]?.id ?? null) : current));
    },
    [runs, persistRuns],
  );

  const activeRun = runs.find((r) => r.id === (activeRunId ?? runs[0]?.id)) ?? runs[0] ?? null;
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <AppLayout>
      <div className="w-full px-5 pt-8 pb-14 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.21, 0.65, 0.25, 1] }}
        >
          <PageHeader
            eyebrow="Evaluations"
            title={
              <>
                Evaluation runs<span className="text-[var(--nx-faint)]">.</span>
              </>
            }
            lede="A fixed question set, answered live against your indexed code."
            actions={
              running ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                >
                  <Square size={14} /> Cancel run
                </Button>
              ) : (
                <Button
                  onClick={() => void runEvaluation()}
                  disabled={repositories.length === 0 || questions.length === 0}
                >
                  <Play size={14} /> Run evaluation
                </Button>
              )
            }
          />

          {reposLoading ? (
            <EmptyState
              icon={<LoaderCircle size={22} className="animate-spin" />}
              title="Loading repositories"
              body="Reading your indexed repositories to build the evaluation target list."
            />
          ) : repositories.length === 0 ? (
            <EmptyState
              icon={<FlaskConical size={22} />}
              title="Nothing to evaluate yet"
              body="Evaluations run live questions against a READY repository. Index one first, then come back and press Run."
              action={<Button href="/sync">Open Sync</Button>}
            />
          ) : (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-4">
                <div className="flex min-w-0 flex-1 items-center gap-3 text-[13px] text-[var(--nx-muted)] sm:flex-none">
                  Target repository
                  <Select
                    ariaLabel="Target repository"
                    value={repoId}
                    onChange={setRepoId}
                    disabled={running}
                    options={repositories.map((r) => ({
                      value: r.id,
                      label: `${r.owner} / ${r.name}`,
                    }))}
                    variant="inset"
                    size="sm"
                    className="min-w-0 flex-1 sm:w-64 sm:flex-none"
                  />
                </div>
                <p className="w-full font-mono text-[10.5px] tracking-[0.08em] text-[var(--nx-faint)] sm:ml-auto sm:w-auto">
                  {questions.length} LIVE QUESTIONS · SEQUENTIAL · MEASURED END-TO-END
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--nx-faint)] uppercase">
                    Question set · yours to edit
                  </p>
                  <button
                    onClick={() => {
                      if (!running) persistQuestions([...DEFAULT_QUESTIONS]);
                    }}
                    disabled={running}
                    className="font-mono text-[10px] tracking-[0.1em] text-[var(--nx-muted)] uppercase hover:text-[var(--nx-mint)] disabled:opacity-50"
                  >
                    Reset defaults
                  </button>
                </div>
                <ul className="mt-3 grid gap-2">
                  {questions.map((q, i) => (
                    <li
                      key={`${i}-${q.slice(0, 24)}`}
                      className="flex items-center gap-2.5 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-inset)] px-3 py-2 text-[12.5px] text-[var(--nx-ink)]"
                    >
                      <span className="font-mono text-[10px] tabular-nums text-[var(--nx-faint)]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{q}</span>
                      <button
                        onClick={() => removeQuestion(i)}
                        disabled={running}
                        aria-label={`Remove question ${i + 1}`}
                        className="grid size-6 shrink-0 place-items-center rounded-lg text-[var(--nx-faint)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-bad)] disabled:opacity-50"
                      >
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                  {questions.length === 0 && (
                    <li className="rounded-xl border border-dashed border-[var(--nx-border-strong)] px-3 py-4 text-center text-[12px] text-[var(--nx-faint)]">
                      No questions — add at least one below to run an evaluation.
                    </li>
                  )}
                </ul>
                <div className="mt-3 flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addQuestion();
                      }
                    }}
                    disabled={running}
                    placeholder="Add a question about this repository…"
                    aria-label="Add a custom evaluation question"
                    className="h-9 min-w-0 flex-1 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-inset)] px-3 text-[13px] text-[var(--nx-ink)] outline-none placeholder:text-[var(--nx-faint)] disabled:opacity-60"
                  />
                  <Button
                    variant="secondary"
                    onClick={addQuestion}
                    disabled={running || !draft.trim()}
                  >
                    <Plus size={14} /> Add
                  </Button>
                </div>
              </div>

              {running && (
                <div className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-4">
                  <div className="flex items-center justify-between font-mono text-[10.5px] tracking-[0.1em] text-[var(--nx-muted)] uppercase">
                    <span className="flex items-center gap-2">
                      <LoaderCircle size={13} className="animate-spin text-[var(--nx-mint)]" />
                      Asking live questions
                    </span>
                    <span className="tabular-nums">
                      {progress.done} / {progress.total}
                    </span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--nx-track)]">
                    <div
                      className="h-full rounded-full bg-[var(--nx-mint)] transition-[width] duration-500"
                      style={{
                        width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  {progress.current && (
                    <p className="mt-2 truncate text-[12px] text-[var(--nx-faint)]">
                      {progress.current}
                    </p>
                  )}
                </div>
              )}

              {activeRun && (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat
                      label="Success rate"
                      value={pct(
                        activeRun.summary.succeeded / Math.max(1, activeRun.summary.total),
                      )}
                      sub={`${activeRun.summary.succeeded} of ${activeRun.summary.total} answered`}
                    />
                    <Stat
                      label="Avg latency"
                      value={formatLatency(activeRun.summary.avgLatencyMs)}
                      sub={
                        activeRun.summary.maxLatencyMs !== null
                          ? `max ${formatLatency(activeRun.summary.maxLatencyMs)}`
                          : "no successful answers"
                      }
                    />
                    <Stat
                      label="Citation rate"
                      value={pct(activeRun.summary.citationRate)}
                      sub="answers with at least one source"
                    />
                    <Stat
                      label="Grounded rate"
                      value={pct(activeRun.summary.groundedRate)}
                      sub="answers flagged grounded by the pipeline"
                    />
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-[var(--nx-border)]">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] border-collapse text-left">
                        <thead>
                          <tr className="border-b border-[var(--nx-border)] bg-[var(--nx-inset)] font-mono text-[10px] tracking-[0.14em] text-[var(--nx-faint)] uppercase">
                            <th className="px-4 py-3 font-medium">Question</th>
                            <th className="px-4 py-3 font-medium">Latency</th>
                            <th className="px-4 py-3 font-medium">Sources</th>
                            <th className="px-4 py-3 font-medium">Grounded</th>
                            <th className="px-4 py-3 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeRun.results.map((r) => (
                            <tr
                              key={r.question}
                              className="border-b border-[var(--nx-border)] text-[12.5px] last:border-0 hover:bg-[var(--nx-raised)]"
                            >
                              <td className="max-w-[380px] px-4 py-3 text-[var(--nx-ink)]">
                                {r.question}
                              </td>
                              <td className="px-4 py-3 font-mono tabular-nums text-[var(--nx-muted)]">
                                {formatLatency(r.latencyMs)}
                              </td>
                              <td className="px-4 py-3 font-mono tabular-nums text-[var(--nx-muted)]">
                                {r.ok ? r.sources : "—"}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={
                                    r.grounded ? "text-[var(--nx-mint)]" : "text-[var(--nx-faint)]"
                                  }
                                >
                                  {r.ok ? (r.grounded ? "yes" : "no") : "—"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {r.ok ? (
                                  <span className="text-[var(--nx-mint)]">answered</span>
                                ) : (
                                  <span
                                    className="text-[var(--nx-bad)]"
                                    title={r.error ?? undefined}
                                  >
                                    failed
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="font-mono text-[10.5px] tracking-[0.08em] text-[var(--nx-faint)]">
                    RUN {new Date(activeRun.at).toLocaleString()} ·{" "}
                    {activeRun.repoName.toUpperCase()} · {activeRun.results.length} QUESTIONS
                  </p>
                </>
              )}

              {runs.length > 1 && (
                <div className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-4">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--nx-faint)] uppercase">
                    Run history
                  </p>
                  <div className="mt-3 grid gap-2">
                    {runs.map((r) => (
                      <div
                        key={r.id}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-[12.5px] ${
                          r.id === activeRun?.id
                            ? "border-[var(--nx-border-strong)] bg-[var(--nx-raised)]"
                            : "border-[var(--nx-border)]"
                        }`}
                      >
                        <button
                          onClick={() => setActiveRunId(r.id)}
                          className="min-w-0 flex-1 truncate text-left text-[var(--nx-ink)] hover:text-[var(--nx-mint)]"
                        >
                          {new Date(r.at).toLocaleString()} · {r.repoName} · {r.summary.succeeded}/
                          {r.summary.total} answered
                          {r.summary.avgLatencyMs !== null
                            ? ` · avg ${formatLatency(r.summary.avgLatencyMs)}`
                            : ""}
                        </button>
                        <button
                          onClick={() => deleteRun(r.id)}
                          aria-label="Delete this run"
                          className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--nx-faint)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-bad)]"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AppLayout>
  );
}
