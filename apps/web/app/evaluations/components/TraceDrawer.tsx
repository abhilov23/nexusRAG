"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock3,
  Coins,
  Gauge,
  LoaderCircle,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { fetchQuery, judgeQuery, setQueryFeedback } from "@/lib/evaluations/client";
import {
  formatCost,
  formatDateTime,
  formatLatency,
  formatPercent,
  formatTokens,
} from "@/lib/evaluations/format";
import type { QueryLogDetail } from "@/lib/evaluations/types";

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3 py-2.5">
      <p className="font-mono text-[9px] tracking-[0.14em] text-[var(--nx-faint)] uppercase">
        {label}
      </p>
      <p className="mt-1.5 font-display text-[17px] font-semibold tabular-nums tracking-tight text-[var(--nx-ink)]">
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 font-mono text-[9.5px] tabular-nums text-[var(--nx-faint)]">{sub}</p>
      ) : null}
    </div>
  );
}

function SectionHeader({ step, title, detail }: { step: string; title: string; detail?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-6 place-items-center rounded-lg border border-[var(--nx-border)] bg-[var(--nx-raised)] font-mono text-[9.5px] text-[var(--nx-muted)]">
        {step}
      </span>
      <h3 className="font-display text-[14px] font-semibold tracking-tight text-[var(--nx-ink)]">
        {title}
      </h3>
      {detail ? (
        <span className="ml-auto font-mono text-[9.5px] tracking-[0.08em] text-[var(--nx-faint)] uppercase">
          {detail}
        </span>
      ) : null}
    </div>
  );
}

function sourceLabel(source: { symbol: string | null; kind: string }): string {
  return source.symbol ?? source.kind;
}

function TracePanel({
  queryId,
  onClose,
  onChanged,
}: {
  queryId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState<QueryLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [judgeBusy, setJudgeBusy] = useState(false);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    const controller = new AbortController();

    fetchQuery(queryId, controller.signal)
      .then((row) => {
        setQuery(row);
        setExpanded(new Set(row.sources?.slice(0, 1).map((source) => source.index) ?? []));
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Could not load this trace.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [queryId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const rate = useCallback(
    async (value: -1 | 1) => {
      if (!query || feedbackBusy) return;
      const next = query.feedback === value ? 0 : value;
      setFeedbackBusy(true);
      try {
        const updated = await setQueryFeedback(query.id, next);
        setQuery(updated);
        onChanged();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not save feedback.");
      } finally {
        setFeedbackBusy(false);
      }
    },
    [query, feedbackBusy, onChanged],
  );

  const judge = useCallback(async () => {
    if (!query || judgeBusy) return;
    setJudgeBusy(true);
    setJudgeError(null);
    try {
      const updated = await judgeQuery(query.id);
      setQuery(updated);
      onChanged();
    } catch (reason) {
      setJudgeError(reason instanceof Error ? reason.message : "Could not judge this answer.");
    } finally {
      setJudgeBusy(false);
    }
  }, [query, judgeBusy, onChanged]);

  const toggleChunk = (index: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const sources = query?.sources ?? query?.trace?.retrieval?.chunks ?? [];
  const retrieval = query?.trace?.retrieval;
  const timings = query?.trace?.timings;
  const context = query?.context ?? query?.trace?.context ?? "";
  const hasExpected = (query?.expectedPaths.length ?? 0) > 0;

  return (
    <motion.div
      className="fixed inset-0 z-[90]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button
        type="button"
        aria-label="Close trace"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label="RAG trace"
        className="absolute inset-y-0 right-0 flex w-full max-w-[820px] flex-col border-l border-[var(--nx-border)] bg-[var(--nx-surface)] shadow-[-40px_0_100px_-40px_rgba(0,0,0,0.9)]"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.32, ease: [0.22, 0.8, 0.24, 1] }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--nx-border)] px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[9.5px] tracking-[0.18em] text-[var(--nx-faint)] uppercase">
              RAG trace
            </p>
            <h2 className="mt-1 truncate font-display text-[20px] font-semibold tracking-tight text-[var(--nx-ink)]">
              {query?.question ?? "Loading query…"}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close trace">
            <X size={16} />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex items-center gap-2 py-10 font-mono text-[11px] tracking-[0.08em] text-[var(--nx-faint)] uppercase">
              <LoaderCircle size={14} className="animate-spin" />
              Loading trace
            </div>
          ) : error ? (
            <div className="rounded-xl border border-[var(--nx-bad)]/40 bg-[color-mix(in_srgb,var(--nx-bad)_8%,transparent)] p-4 text-[13px] text-[var(--nx-bad)]">
              {error}
            </div>
          ) : query ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-inset)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={query.status === "SUCCESS" ? "success" : "danger"}>
                    {query.status === "SUCCESS" ? "Answered" : "Failed"}
                  </Badge>
                  <Badge variant="info">{query.mode === "EVALUATION" ? "Benchmark" : "Chat"}</Badge>
                  {query.grounded ? <Badge variant="accent">Grounded</Badge> : null}
                  <span className="ml-auto font-mono text-[9.5px] tracking-[0.08em] text-[var(--nx-faint)] uppercase">
                    {formatDateTime(query.createdAt)}
                  </span>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--nx-ink)]">
                  {query.question}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="font-mono text-[10px] text-[var(--nx-faint)]">
                    {query.repository
                      ? `${query.repository.owner}/${query.repository.name}`
                      : "All indexed repositories"}
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    <Button
                      variant={query.feedback === 1 ? "secondary" : "ghost"}
                      size="icon"
                      aria-label="Positive feedback"
                      aria-pressed={query.feedback === 1}
                      disabled={feedbackBusy}
                      onClick={() => void rate(1)}
                    >
                      <ThumbsUp size={15} />
                    </Button>
                    <Button
                      variant={query.feedback === -1 ? "secondary" : "ghost"}
                      size="icon"
                      aria-label="Negative feedback"
                      aria-pressed={query.feedback === -1}
                      disabled={feedbackBusy}
                      onClick={() => void rate(-1)}
                    >
                      <ThumbsDown size={15} />
                    </Button>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniStat
                  label="Total"
                  value={formatLatency(query.latencyMs)}
                  sub={timings ? `${Math.round(timings.total_ms)}ms pipeline` : undefined}
                />
                <MiniStat
                  label="Retrieval"
                  value={formatLatency(query.retrievalLatencyMs)}
                  sub={
                    retrieval
                      ? `${retrieval.vector_hits} vec · ${retrieval.lexical_hits} lex`
                      : undefined
                  }
                />
                <MiniStat
                  label="Tokens"
                  value={formatTokens(query.totalTokens)}
                  sub={`${formatTokens(query.promptTokens)} in · ${formatTokens(
                    query.completionTokens,
                  )} out`}
                />
                <MiniStat
                  label="Cost"
                  value={formatCost(query.costUsd)}
                  sub={query.model ?? "estimate"}
                />
              </div>

              <section className="rounded-2xl border border-[var(--nx-border)] p-4">
                <SectionHeader step="01" title="Retrieval" detail={`${sources.length} chunks`} />
                {retrieval ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["Vector", retrieval.vector_hits],
                      ["Lexical", retrieval.lexical_hits],
                      ["Fused", retrieval.fused],
                      ["Returned", retrieval.returned],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-lg border border-[var(--nx-border)] bg-[var(--nx-raised)] px-2.5 py-2"
                      >
                        <p className="font-mono text-[9px] tracking-[0.12em] text-[var(--nx-faint)] uppercase">
                          {label}
                        </p>
                        <p className="mt-1 font-display text-[15px] font-semibold tabular-nums text-[var(--nx-ink)]">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[12px] text-[var(--nx-faint)]">
                    No retrieval counters were stored for this query.
                  </p>
                )}

                <div className="mt-3 grid gap-2">
                  {sources.map((source) => {
                    const isOpen = expanded.has(source.index);
                    return (
                      <div
                        key={`${source.index}-${source.path}-${source.start_line}`}
                        className="overflow-hidden rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)]"
                      >
                        <button
                          type="button"
                          onClick={() => toggleChunk(source.index)}
                          disabled={!source.content}
                          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left disabled:cursor-default"
                        >
                          <span className="font-mono text-[9.5px] tabular-nums text-[var(--nx-faint)]">
                            {String(source.index).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium text-[var(--nx-ink)]">
                              {source.path}
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[9px] text-[var(--nx-faint)]">
                              <span className="truncate">
                                {sourceLabel(source)} · L{source.start_line}-{source.end_line}
                              </span>
                              {Object.entries(source.ranks).map(([name, rank]) => (
                                <Badge key={name} variant="default">
                                  {name} #{rank}
                                </Badge>
                              ))}
                            </span>
                          </span>
                          <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--nx-muted)]">
                            {source.score.toFixed(4)}
                          </span>
                          {source.content ? (
                            isOpen ? (
                              <ChevronDown size={13} className="shrink-0 text-[var(--nx-faint)]" />
                            ) : (
                              <ChevronRight size={13} className="shrink-0 text-[var(--nx-faint)]" />
                            )
                          ) : null}
                        </button>
                        {isOpen && source.content ? (
                          <pre className="max-h-72 overflow-auto border-t border-[var(--nx-border)] bg-[var(--nx-code)] px-3 py-3 font-mono text-[10.5px] leading-relaxed text-[var(--nx-muted)]">
                            {source.content}
                          </pre>
                        ) : null}
                      </div>
                    );
                  })}
                  {sources.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[var(--nx-border-strong)] px-3 py-5 text-center text-[12px] text-[var(--nx-faint)]">
                      No chunks were retrieved.
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-2xl border border-[var(--nx-border)] p-4">
                <SectionHeader
                  step="02"
                  title="Context sent to the model"
                  detail={`${context.length.toLocaleString()} chars`}
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-[12px] leading-relaxed text-[var(--nx-faint)]">
                    The exact prompt, including source blocks and line ranges.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowContext((current) => !current)}
                    disabled={!context}
                  >
                    {showContext ? "Hide" : "Show"}
                  </Button>
                </div>
                {showContext ? (
                  context ? (
                    <pre className="mt-3 max-h-80 overflow-auto rounded-xl border border-[var(--nx-border)] bg-[var(--nx-code)] px-3 py-3 font-mono text-[10.5px] leading-relaxed text-[var(--nx-muted)]">
                      {context}
                    </pre>
                  ) : (
                    <p className="mt-3 text-[12px] text-[var(--nx-faint)]">
                      No context was stored for this query.
                    </p>
                  )
                ) : null}
              </section>

              <section className="rounded-2xl border border-[var(--nx-border)] p-4">
                <SectionHeader step="03" title="Answer" detail={query.model ?? "generation"} />
                {query.status === "ERROR" ? (
                  <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-[var(--nx-bad)]/40 bg-[color-mix(in_srgb,var(--nx-bad)_8%,transparent)] p-3 text-[12.5px] text-[var(--nx-bad)]">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <span>
                      {query.errorMessage ?? "The request failed before an answer was produced."}
                    </span>
                  </div>
                ) : query.answer ? (
                  <div className="mt-3 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-inset)] p-4">
                    <Markdown>{query.answer}</Markdown>
                  </div>
                ) : (
                  <p className="mt-3 text-[12px] text-[var(--nx-faint)]">
                    No answer text was stored.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] tabular-nums text-[var(--nx-faint)]">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 size={12} /> generation {formatLatency(query.generationLatencyMs)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Gauge size={12} /> {formatTokens(query.promptTokens)} in /{" "}
                    {formatTokens(query.completionTokens)} out
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Coins size={12} /> {formatCost(query.costUsd)}
                  </span>
                </div>
              </section>

              <section className="rounded-2xl border border-[var(--nx-border)] p-4">
                <SectionHeader step="04" title="Quality" />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[var(--nx-border)] bg-[var(--nx-raised)] p-3">
                    <p className="font-mono text-[9px] tracking-[0.14em] text-[var(--nx-faint)] uppercase">
                      Retrieval {hasExpected ? `@ ${query.retrievalK ?? "K"}` : ""}
                    </p>
                    {hasExpected ? (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {[
                          ["Recall", formatPercent(query.recallAtK)],
                          ["Precision", formatPercent(query.precisionAtK)],
                          ["MRR", query.mrr === null ? "—" : query.mrr.toFixed(3)],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <p className="font-mono text-[8.5px] tracking-[0.1em] text-[var(--nx-faint)] uppercase">
                              {label}
                            </p>
                            <p className="mt-1 font-display text-[15px] font-semibold tabular-nums text-[var(--nx-ink)]">
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--nx-faint)]">
                        Not labelled. Benchmarks with expected file paths enable Recall, Precision
                        and MRR.
                      </p>
                    )}
                    {hasExpected ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer font-mono text-[9.5px] tracking-[0.08em] text-[var(--nx-muted)] uppercase">
                          Expected paths
                        </summary>
                        <ul className="mt-1.5 grid gap-1 font-mono text-[10px] text-[var(--nx-faint)]">
                          {query.expectedPaths.map((path) => (
                            <li key={path} className="truncate">
                              {path}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-[var(--nx-border)] bg-[var(--nx-raised)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[9px] tracking-[0.14em] text-[var(--nx-faint)] uppercase">
                        Answer quality
                      </p>
                      <Sparkles size={13} className="text-[var(--nx-faint)]" />
                    </div>
                    {query.faithfulness !== null && query.relevance !== null ? (
                      <>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {[
                            ["Faithfulness", formatPercent(query.faithfulness)],
                            ["Relevance", formatPercent(query.relevance)],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <p className="font-mono text-[8.5px] tracking-[0.1em] text-[var(--nx-faint)] uppercase">
                                {label}
                              </p>
                              <p className="mt-1 font-display text-[15px] font-semibold tabular-nums text-[var(--nx-ink)]">
                                {value}
                              </p>
                            </div>
                          ))}
                        </div>
                        {query.judgeRationale ? (
                          <p className="mt-2 text-[11px] leading-relaxed text-[var(--nx-muted)]">
                            {query.judgeRationale}
                          </p>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 px-0"
                          disabled={judgeBusy || !query.answer || !context}
                          onClick={() => void judge()}
                        >
                          {judgeBusy ? (
                            <LoaderCircle size={12} className="animate-spin" />
                          ) : (
                            <Sparkles size={12} />
                          )}
                          Re-judge
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--nx-faint)]">
                          {query.mode === "EVALUATION"
                            ? "This benchmark question was not judged, or judging failed."
                            : "Judge this answer with the configured model. It is a model score, not ground truth."}
                        </p>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="mt-2"
                          disabled={judgeBusy || !query.answer || !context}
                          onClick={() => void judge()}
                        >
                          {judgeBusy ? (
                            <LoaderCircle size={12} className="animate-spin" />
                          ) : (
                            <Sparkles size={12} />
                          )}
                          Judge answer
                        </Button>
                      </>
                    )}
                    {judgeError ? (
                      <p className="mt-2 text-[11px] text-[var(--nx-bad)]">{judgeError}</p>
                    ) : null}
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </motion.aside>
    </motion.div>
  );
}

export function TraceDrawer({
  queryId,
  onClose,
  onChanged,
}: {
  queryId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <AnimatePresence>
      {queryId ? (
        <TracePanel key={queryId} queryId={queryId} onClose={onClose} onChanged={onChanged} />
      ) : null}
    </AnimatePresence>
  );
}
