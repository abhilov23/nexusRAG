"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Clock3,
  Coins,
  FlaskConical,
  LoaderCircle,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import { AppLayout } from "@/app/components/AppLayout";
import { BenchmarkPanel } from "@/app/evaluations/components/BenchmarkPanel";
import {
  LineChart,
  QueriesChart,
  formatLatencyAxis,
  latencySeries,
} from "@/app/evaluations/components/Charts";
import { TraceDrawer } from "@/app/evaluations/components/TraceDrawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState, PageHeader, Stat } from "@/components/ui/sections";
import { fetchOverview, setQueryFeedback } from "@/lib/evaluations/client";
import {
  formatBucketLabel,
  formatCost,
  formatCount,
  formatDateTime,
  formatLatency,
  formatPercent,
  formatTokens,
  rangeLabel,
} from "@/lib/evaluations/format";
import type { Overview, RangeKey, RecentQuery } from "@/lib/evaluations/types";
import { listRepositories, type Repository } from "@/lib/repositories/client";

function QualityCard({
  title,
  subtitle,
  values,
  footer,
}: {
  title: string;
  subtitle: string;
  values: { label: string; value: string }[];
  footer: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-[10px] font-medium tracking-[0.16em] text-[var(--nx-faint)] uppercase">
          {title}
        </p>
        <Badge variant="info">{subtitle}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {values.map((item) => (
          <div key={item.label}>
            <p className="font-mono text-[9px] tracking-[0.1em] text-[var(--nx-faint)] uppercase">
              {item.label}
            </p>
            <p className="mt-1.5 font-display text-[24px] font-semibold leading-none tracking-[-0.03em] text-[var(--nx-ink)] tabular-nums">
              {item.value}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-[var(--nx-border)] pt-3 text-[11.5px] leading-relaxed text-[var(--nx-faint)]">
        {footer}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] font-medium tracking-[0.16em] text-[var(--nx-faint)] uppercase">
          {title}
        </p>
        <p className="font-mono text-[9px] tracking-[0.08em] text-[var(--nx-faint)] uppercase">
          {subtitle}
        </p>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function feedbackButtonClass(active: boolean) {
  return `grid size-7 place-items-center rounded-lg border transition-colors ${
    active
      ? "border-[var(--nx-border-strong)] bg-[var(--nx-raised)] text-[var(--nx-ink)]"
      : "border-transparent text-[var(--nx-faint)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
  }`;
}

export default function EvaluationsPage() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [repositoryId, setRepositoryId] = useState("");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    listRepositories(controller.signal)
      .then((rows) => {
        setRepositories(rows.filter((repo) => repo.status === "READY"));
      })
      .catch(() => {
        // The filter still works with "All repositories"; the page is not blocked.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetchOverview(range, repositoryId || null, controller.signal)
      .then((data) => {
        setOverview(data);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Could not load telemetry.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [range, repositoryId, refreshKey]);

  const rate = useCallback(
    async (row: RecentQuery, value: -1 | 1) => {
      if (feedbackBusy) return;
      const next = row.feedback === value ? 0 : value;
      setFeedbackBusy(row.id);
      try {
        await setQueryFeedback(row.id, next);
        refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not save feedback.");
      } finally {
        setFeedbackBusy(null);
      }
    },
    [feedbackBusy, refresh],
  );

  const labels = overview
    ? overview.buckets.map((bucket) => formatBucketLabel(bucket.start, range))
    : [];

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
                RAG telemetry<span className="text-[var(--nx-faint)]">.</span>
              </>
            }
            lede="Real query volume, retrieval traces and cost — with labelled benchmarks for retrieval quality and model-judged answer quality."
            actions={
              <>
                <Button variant="secondary" onClick={refresh} disabled={loading}>
                  {loading ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Refresh
                </Button>
                <Button onClick={() => setBenchmarkOpen(true)}>
                  <FlaskConical size={14} /> Run benchmark
                </Button>
              </>
            }
          />

          <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-3">
            <div
              className="inline-flex items-center gap-0.5 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-inset)] p-0.5"
              role="group"
              aria-label="Time range"
            >
              {(["24h", "7d", "30d"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={range === value}
                  onClick={() => {
                    if (value === range) return;
                    setLoading(true);
                    setError(null);
                    setRange(value);
                  }}
                  className={`rounded-lg px-3 py-1.5 font-mono text-[10px] font-medium tracking-[0.08em] uppercase transition-colors ${
                    range === value
                      ? "bg-[var(--nx-ink)] text-[var(--nx-bg)]"
                      : "text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>

            <Select
              ariaLabel="Filter by repository"
              value={repositoryId}
              onChange={(value) => {
                setLoading(true);
                setError(null);
                setRepositoryId(value);
              }}
              options={[
                { value: "", label: "All repositories" },
                ...repositories.map((repo) => ({
                  value: repo.id,
                  label: `${repo.owner}/${repo.name}`,
                })),
              ]}
              variant="inset"
              size="sm"
              className="w-[min(100%,260px)]"
            />

            <p className="ml-auto font-mono text-[9.5px] tracking-[0.08em] text-[var(--nx-faint)] uppercase">
              {rangeLabel(range)} · {formatCount(overview?.totals.queries)} queries
            </p>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-[var(--nx-bad)]/40 bg-[color-mix(in_srgb,var(--nx-bad)_8%,transparent)] px-3 py-2.5 text-[12px] text-[var(--nx-bad)]">
              {error}
            </div>
          ) : null}

          {loading && !overview ? (
            <EmptyState
              icon={<LoaderCircle size={22} className="animate-spin" />}
              title="Loading telemetry"
              body="Reading persisted query traces and benchmark runs."
            />
          ) : overview && overview.totals.queries === 0 ? (
            <EmptyState
              icon={<Activity size={22} />}
              title="No queries recorded yet"
              body={
                repositories.length === 0
                  ? "Index a repository first, then ask a question or run a benchmark. Telemetry appears here automatically."
                  : "Ask a question in Chat, or run a labelled benchmark. Every request is recorded with its retrieval trace."
              }
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {repositories.length === 0 ? (
                    <Button href="/sync">Open Sync</Button>
                  ) : (
                    <Button href="/chat">Open Chat</Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => setBenchmarkOpen(true)}
                    disabled={repositories.length === 0}
                  >
                    <FlaskConical size={14} /> Run benchmark
                  </Button>
                </div>
              }
            />
          ) : overview ? (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                <Stat
                  label="Total queries"
                  value={formatCount(overview.totals.queries)}
                  sub={`${formatCount(overview.totals.succeeded)} succeeded · ${formatCount(
                    overview.totals.errors,
                  )} errors`}
                  icon={<Activity size={14} />}
                />
                <Stat
                  label="Success rate"
                  value={formatPercent(overview.totals.successRate)}
                  sub={`${formatCount(overview.totals.errors)} failed requests`}
                  icon={<BarChart3 size={14} />}
                  accent="cyan"
                />
                <Stat
                  label="Avg latency"
                  value={formatLatency(overview.totals.avgLatencyMs)}
                  sub={`P95 ${formatLatency(overview.totals.p95LatencyMs)}`}
                  icon={<Clock3 size={14} />}
                />
                <Stat
                  label="Tokens"
                  value={formatTokens(overview.totals.totalTokens)}
                  sub={`${formatTokens(overview.totals.promptTokens)} in · ${formatTokens(
                    overview.totals.completionTokens,
                  )} out`}
                  icon={<BarChart3 size={14} />}
                />
                <Stat
                  label="Est. cost"
                  value={formatCost(overview.totals.totalCostUsd)}
                  sub={`avg ${formatCost(overview.totals.avgCostUsd)} / query`}
                  icon={<Coins size={14} />}
                />
                <Stat
                  label="Feedback"
                  value={formatPercent(overview.totals.feedbackRate)}
                  sub={`${formatCount(overview.totals.feedbackUp)} up · ${formatCount(
                    overview.totals.feedbackDown,
                  )} down`}
                  icon={<ThumbsUp size={14} />}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <QualityCard
                  title="Retrieval quality"
                  subtitle={
                    overview.retrievalQuality.k !== null
                      ? `K = ${overview.retrievalQuality.k}`
                      : "labelled runs"
                  }
                  values={[
                    {
                      label: "Recall",
                      value: formatPercent(overview.retrievalQuality.recallAtK),
                    },
                    {
                      label: "Precision",
                      value: formatPercent(overview.retrievalQuality.precisionAtK),
                    },
                    {
                      label: "MRR",
                      value:
                        overview.retrievalQuality.mrr === null
                          ? "—"
                          : overview.retrievalQuality.mrr.toFixed(3),
                    },
                  ]}
                  footer={
                    overview.retrievalQuality.sampleCount > 0
                      ? `${formatCount(
                          overview.retrievalQuality.sampleCount,
                        )} labelled benchmark queries. Ground truth comes from expected paths, not the model.`
                      : "No labelled queries yet. Add expected file paths in a benchmark to measure retrieval."
                  }
                />
                <QualityCard
                  title="Answer quality"
                  subtitle="model judge"
                  values={[
                    {
                      label: "Faithful",
                      value: formatPercent(overview.answerQuality.faithfulness),
                    },
                    {
                      label: "Relevant",
                      value: formatPercent(overview.answerQuality.relevance),
                    },
                    {
                      label: "Judged",
                      value: formatCount(overview.answerQuality.sampleCount),
                    },
                  ]}
                  footer={
                    overview.answerQuality.sampleCount > 0
                      ? `${formatCount(
                          overview.answerQuality.sampleCount,
                        )} answers scored by the configured model. This is a model judgement, not ground truth.`
                      : "No answers judged yet. Enable judging in a benchmark, or open a trace and judge it."
                  }
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <ChartCard title="Queries" subtitle="volume / errors">
                  <QueriesChart buckets={overview.buckets} labels={labels} />
                </ChartCard>
                <ChartCard title="Latency" subtitle="avg / p95">
                  <LineChart
                    labels={labels}
                    series={latencySeries(overview.buckets)}
                    formatValue={formatLatencyAxis}
                    ariaLabel="Latency over time"
                  />
                </ChartCard>
                <ChartCard title="Cost" subtitle="estimated USD">
                  <LineChart
                    labels={labels}
                    series={[
                      {
                        label: "Cost",
                        color: "var(--nx-ink)",
                        values: overview.buckets.map((bucket) => bucket.costUsd),
                      },
                    ]}
                    formatValue={formatCost}
                    ariaLabel="Estimated cost over time"
                  />
                </ChartCard>
              </div>

              <section className="overflow-hidden rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--nx-border)] px-4 py-3">
                  <div>
                    <p className="font-mono text-[10px] font-medium tracking-[0.16em] text-[var(--nx-faint)] uppercase">
                      Recent queries
                    </p>
                    <p className="mt-1 text-[11.5px] text-[var(--nx-faint)]">
                      Click a row for retrieval scores, context, tokens and the answer trace.
                    </p>
                  </div>
                  <span className="font-mono text-[9.5px] tracking-[0.08em] text-[var(--nx-faint)] uppercase">
                    Latest {formatCount(overview.recentQueries.length)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[var(--nx-border)] bg-[var(--nx-inset)] font-mono text-[9px] tracking-[0.12em] text-[var(--nx-faint)] uppercase">
                        <th className="px-4 py-2.5 font-medium">Query</th>
                        <th className="px-3 py-2.5 font-medium">Chunks</th>
                        <th className="px-3 py-2.5 font-medium">Latency</th>
                        <th className="px-3 py-2.5 font-medium">Tokens</th>
                        <th className="px-3 py-2.5 font-medium">Cost</th>
                        <th className="px-3 py-2.5 font-medium">Status</th>
                        <th className="px-3 py-2.5 font-medium">Feedback</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recentQueries.map((row) => (
                        <tr
                          key={row.id}
                          tabIndex={0}
                          onClick={() => setTraceId(row.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setTraceId(row.id);
                            }
                          }}
                          className="cursor-pointer border-b border-[var(--nx-border)] text-[12px] transition-colors last:border-0 hover:bg-[var(--nx-raised)] focus-visible:bg-[var(--nx-raised)] focus-visible:outline-none"
                        >
                          <td className="max-w-[420px] px-4 py-2.5">
                            <span className="block truncate text-[var(--nx-ink)]">
                              {row.question}
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[9px] text-[var(--nx-faint)]">
                              <span>{row.repositoryName ?? "all repositories"}</span>
                              <span>·</span>
                              <span>{formatDateTime(row.createdAt)}</span>
                              <Badge variant={row.mode === "EVALUATION" ? "accent" : "default"}>
                                {row.mode === "EVALUATION" ? "benchmark" : "chat"}
                              </Badge>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-[var(--nx-muted)]">
                            {formatCount(row.sourceCount)}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-[var(--nx-muted)]">
                            {formatLatency(row.latencyMs)}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-[var(--nx-muted)]">
                            {formatTokens(row.totalTokens)}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-[var(--nx-muted)]">
                            {formatCost(row.costUsd)}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant={row.status === "SUCCESS" ? "success" : "danger"}>
                              {row.status === "SUCCESS" ? "ok" : "error"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="flex items-center gap-0.5">
                              <button
                                type="button"
                                aria-label="Positive feedback"
                                aria-pressed={row.feedback === 1}
                                disabled={feedbackBusy === row.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void rate(row, 1);
                                }}
                                className={feedbackButtonClass(row.feedback === 1)}
                              >
                                <ThumbsUp size={13} />
                              </button>
                              <button
                                type="button"
                                aria-label="Negative feedback"
                                aria-pressed={row.feedback === -1}
                                disabled={feedbackBusy === row.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void rate(row, -1);
                                }}
                                className={feedbackButtonClass(row.feedback === -1)}
                              >
                                <ThumbsDown size={13} />
                              </button>
                            </span>
                          </td>
                        </tr>
                      ))}
                      {overview.recentQueries.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-8 text-center text-[12px] text-[var(--nx-faint)]"
                          >
                            No queries in this range.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : null}
        </motion.div>
      </div>

      <TraceDrawer queryId={traceId} onClose={() => setTraceId(null)} onChanged={refresh} />
      <BenchmarkPanel
        open={benchmarkOpen}
        onClose={() => setBenchmarkOpen(false)}
        repositories={repositories}
        defaultRepositoryId={repositoryId || repositories[0]?.id || ""}
        onFinished={refresh}
        onOpenTrace={(id) => {
          setBenchmarkOpen(false);
          setTraceId(id);
        }}
      />
    </AppLayout>
  );
}
