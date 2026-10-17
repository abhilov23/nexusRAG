"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Check,
  CircleAlert,
  Clock3,
  CloudUpload,
  Download,
  GitBranch,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { AppLayout } from "@/app/components/AppLayout";
import { Button } from "@/components/ui/button";
import { PageHeader, Stat } from "@/components/ui/sections";
import { motion } from "framer-motion";
import {
  ApiError,
  fetchQueueStats,
  isActive,
  listRepositories,
  statusLabel,
  submitRepository,
  type QueueStats,
  type Repository,
  type RepositoryStatus,
} from "@/lib/repositories/client";
import { formatBytes, formatRelative, shortSha } from "@/lib/repositories/format";

/** How often to re-read state while something is still moving. */
const POLL_MS = 4000;

function statusIcon(status: RepositoryStatus) {
  switch (status) {
    case "READY":
      return Check;
    case "DOWNLOADING":
      return Download;
    case "UPLOADING":
      return CloudUpload;
    case "FAILED":
      return CircleAlert;
    default:
      return Clock3;
  }
}

function JobBadge({ status }: { status: RepositoryStatus }) {
  const spinning = status === "DOWNLOADING" || status === "UPLOADING" || status === "QUEUED";
  const tone =
    status === "READY"
      ? "border-[var(--nx-border-strong)] bg-[var(--nx-raised)] text-[var(--nx-ink)]"
      : status === "FAILED"
        ? "border-[var(--nx-bad)] bg-[color-mix(in_srgb,var(--nx-bad)_10%,transparent)] text-[var(--nx-bad)]"
        : "border-[var(--nx-border)] bg-[var(--nx-raised)] text-[var(--nx-muted)]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] font-mono text-[10px] font-medium uppercase tracking-[0.08em] ${tone}`}
    >
      {/* createElement rather than `const Icon = ...; <Icon />`, which the React
          compiler lint reads as an unstable component reference. */}
      {createElement(statusIcon(status), { size: 13, className: spinning ? "animate-spin" : "" })}
      {statusLabel(status)}
    </span>
  );
}

export default function SyncPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [queue, setQueue] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<Record<string, true>>({});
  const [syncingAll, setSyncingAll] = useState(false);
  const [lastChecked, setLastChecked] = useState<string>("never");
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState("");

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async (options: { quiet?: boolean } = {}) => {
    if (!options.quiet) setLoading(true);
    try {
      const [repos, stats] = await Promise.all([
        listRepositories(),
        fetchQueueStats().catch(() => null),
      ]);
      if (!mounted.current) return;
      setRepositories(repos);
      setQueue(stats);
      setLastChecked("just now");
      setError(null);
    } catch (caught) {
      if (!mounted.current) return;
      setError(caught instanceof ApiError ? caught.message : "Could not reach the NexusRAG API.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Loading state on mount. Every setState inside `refresh` happens after an
    // `await`, so nothing is set synchronously in the effect body -- but the
    // rule cannot see through the useCallback indirection and flags the call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh({ quiet: true });
  }, [refresh]);

  // Poll only while there is work in flight, so an idle page is not polling.
  const hasActive = repositories.some((repo) => isActive(repo.status));
  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => void refresh({ quiet: true }), POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasActive, refresh]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return repositories;
    return repositories.filter(
      (repo) =>
        repo.name.toLowerCase().includes(needle) || repo.owner.toLowerCase().includes(needle),
    );
  }, [repositories, filter]);

  const ready = repositories.filter((repo) => repo.status === "READY").length;
  const activeCount = repositories.filter((repo) => isActive(repo.status)).length;
  const failed = repositories.filter((repo) => repo.status === "FAILED").length;

  const submit = useCallback(
    async (url: string, key?: string) => {
      // A fresh key per intent: replaying one key returns the original response
      // instead of enqueueing, which is what we want for a retried request but
      // not for a genuinely new submission.
      await submitRepository(url, key);
      await refresh({ quiet: true });
    },
    [refresh],
  );

  const runOne = useCallback(
    async (repo: Repository) => {
      setBusy((current) => ({ ...current, [repo.id]: true }));
      setError(null);
      setNotice(null);
      try {
        const result = await submitRepository(repo.githubUrl);
        setNotice(
          result.repository.unchanged
            ? `${repo.owner}/${repo.name} is already up to date.`
            : `Queued ${result.repository.owner}/${result.repository.name} for ingestion.`,
        );
        await refresh({ quiet: true });
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : "Could not queue this repository.");
      } finally {
        setBusy((current) => {
          const next = { ...current };
          delete next[repo.id];
          return next;
        });
      }
    },
    [refresh],
  );

  const syncAll = useCallback(async () => {
    setSyncingAll(true);
    setError(null);
    setNotice(null);
    // Sequential on purpose: each call costs two GitHub API requests, and firing
    // them together would burn the anonymous rate limit in seconds.
    for (const repo of repositories) {
      if (repo.status === "FAILED" || repo.status === "READY") {
        try {
          await submitRepository(repo.githubUrl);
        } catch (caught) {
          setError(
            caught instanceof ApiError
              ? `${repo.name}: ${caught.message}`
              : `Could not queue ${repo.name}.`,
          );
          break;
        }
      }
    }
    setSyncingAll(false);
    await refresh({ quiet: true });
  }, [repositories, refresh]);

  const addRepository = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const url = newUrl.trim();
      if (!url) return;

      setAdding(true);
      setError(null);
      setNotice(null);
      try {
        await submit(url);
        setNotice(`Queued ${url} for ingestion.`);
        setNewUrl("");
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : "Could not queue this repository.");
      } finally {
        setAdding(false);
      }
    },
    [newUrl, submit],
  );

  const queueHealthy = queue ? queue.active > 0 || queue.waiting > 0 : null;

  return (
    <AppLayout>
      <div className="w-full px-5 pt-8 pb-14 sm:px-8">
        <PageHeader
          eyebrow="Pipeline status"
          title={
            <>
              Ingestion &amp; sync<span className="text-[var(--nx-faint)]">.</span>
            </>
          }
          lede="Monitor repository indexing jobs and retry failed runs."
          actions={
            <Button onClick={syncAll} disabled={syncingAll || loading}>
              <RefreshCw size={15} className={syncingAll ? "animate-spin" : ""} />
              {syncingAll ? "Syncing repositories" : "Sync all repositories"}
            </Button>
          }
        />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.21, 0.65, 0.25, 1] }}
          className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] px-4 py-3"
        >
          <Activity size={16} className="shrink-0 text-[var(--nx-ink)]" />
          <p className="min-w-0 flex-1 text-[12.5px] text-[var(--nx-muted)]">
            <strong className="mr-2 font-semibold text-[var(--nx-ink)]">Ingestion queue</strong>
            {queue
              ? `${queue.waiting} waiting · ${queue.active} active · ${queue.delayed} delayed · ${queue.failed} failed`
              : "Queue depth is unavailable right now."}
          </p>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--nx-muted)]">
            <span
              className={`size-1.5 rounded-full ${queueHealthy ? "animate-pulse bg-[var(--nx-ink)]" : queueHealthy === null ? "bg-[var(--nx-idle)]" : "bg-[var(--nx-idle)]"}`}
            />
            {queueHealthy === null ? "Unknown" : queueHealthy ? "Working" : "Idle"}
          </span>
        </motion.div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="Connected repositories"
            value={repositories.length}
            sub="Connected in this workspace"
            accent="mint"
          />
          <Stat
            label="Ready"
            value={`${ready} / ${repositories.length}`}
            sub="Archive stored and indexed"
            accent="cyan"
          />
          <Stat
            label="Active jobs"
            value={activeCount}
            sub={failed > 0 ? `${failed} failed` : "Queued or in progress"}
            accent={failed > 0 ? "rose" : "amber"}
          />
        </div>

        {error && (
          <div
            className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--nx-bad)] bg-[color-mix(in_srgb,var(--nx-bad)_8%,transparent)] px-4 py-3"
            role="alert"
          >
            <p className="text-[12.5px] text-[var(--nx-bad)]">{error}</p>
            <button
              onClick={() => void refresh()}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3 text-[12px] text-[var(--nx-ink)] hover:border-[var(--nx-border-strong)]"
            >
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        )}
        {notice && !error && (
          <p
            className="mt-4 rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] px-4 py-3 text-[12.5px] text-[var(--nx-muted)]"
            role="status"
          >
            {notice}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
              Jobs
            </p>
            <h2 className="font-display mt-1.5 text-[20px] font-semibold tracking-tight text-[var(--nx-ink)]">
              Repository jobs
            </h2>
            <p className="mt-1 text-[12px] text-[var(--nx-muted)]">
              Latest sync and indexing activity by repository.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3 text-[var(--nx-muted)] focus-within:border-[var(--nx-ink)]">
              <Search size={15} className="shrink-0" />
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter repositories"
                aria-label="Filter sync jobs"
                className="w-40 bg-transparent text-[13px] text-[var(--nx-ink)] outline-none placeholder:text-[var(--nx-faint)]"
              />
            </label>
            <button
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3.5 text-[12.5px] text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)] disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        <form
          className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-2.5 pl-3.5"
          onSubmit={addRepository}
        >
          <Plus size={15} className="shrink-0 text-[var(--nx-faint)]" />
          <input
            value={newUrl}
            onChange={(event) => setNewUrl(event.target.value)}
            placeholder="https://github.com/owner/repository"
            aria-label="Repository URL to ingest"
            className="h-9 min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-[var(--nx-ink)] outline-none placeholder:text-[var(--nx-faint)]"
          />
          <button
            type="submit"
            disabled={adding || !newUrl.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--nx-signal)] px-4 text-[12.5px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85 disabled:opacity-40"
          >
            {adding ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}
            {adding ? "Queueing" : "Add repository"}
          </button>
        </form>

        <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--nx-border)] bg-[var(--nx-inset)] font-mono text-[10px] tracking-[0.14em] text-[var(--nx-faint)] uppercase">
                  <th className="px-4 py-3 font-medium">Repository</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Commit</th>
                  <th className="px-4 py-3 font-medium">Archive</th>
                  <th className="px-4 py-3 font-medium">Last activity</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((repo) => (
                  <tr
                    key={repo.id}
                    className="border-b border-[var(--nx-border)] text-[12.5px] last:border-0 hover:bg-[var(--nx-raised)]"
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--nx-border)] bg-[var(--nx-inset)] text-[var(--nx-muted)]">
                          <GitBranch size={14} />
                        </span>
                        <strong className="font-semibold text-[var(--nx-ink)]">
                          {repo.owner} / {repo.name}
                        </strong>
                      </span>
                      {repo.status === "FAILED" && repo.errorMessage && (
                        <p
                          className="mt-1.5 max-w-[280px] truncate text-[11.5px] text-[var(--nx-bad)]"
                          title={repo.errorMessage}
                        >
                          {repo.errorMessage}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-[var(--nx-muted)]">
                        <GitBranch size={12} />
                        {repo.defaultBranch ?? "default"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <JobBadge status={repo.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-[11.5px] tabular-nums text-[var(--nx-muted)]">
                      {shortSha(repo.commitSha ?? repo.latestSha)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11.5px] tabular-nums text-[var(--nx-muted)]">
                      {formatBytes(repo.sizeBytes)}
                    </td>
                    <td className="px-4 py-3 text-[var(--nx-muted)]">
                      {formatRelative(repo.lastIngestedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => void runOne(repo)}
                        disabled={busy[repo.id] === true || isActive(repo.status) || syncingAll}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--nx-border)] px-2.5 text-[11.5px] text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)] disabled:opacity-40"
                      >
                        {busy[repo.id] ? (
                          <LoaderCircle size={13} className="animate-spin" />
                        ) : (
                          <RefreshCw size={13} />
                        )}
                        {repo.status === "FAILED" ? "Retry" : "Re-index"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && visible.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-[13px] font-medium text-[var(--nx-ink)]">
                {repositories.length === 0 ? "No repositories yet" : "No matches"}
              </p>
              <p className="mt-1 text-[12px] text-[var(--nx-muted)]">
                {repositories.length === 0
                  ? "Add a public GitHub URL above to start indexing."
                  : "Try a different filter."}
              </p>
            </div>
          )}
          {loading && repositories.length === 0 && (
            <div
              className="px-4 py-10 text-center text-[12.5px] text-[var(--nx-muted)]"
              role="status"
            >
              <LoaderCircle size={16} className="mx-auto animate-spin" />
              <p className="mt-2">Loading sync state…</p>
            </div>
          )}
        </div>

        <footer className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[10.5px] tracking-[0.08em] text-[var(--nx-faint)] uppercase">
          <CloudUpload size={13} />
          <span>Archives stream from GitHub into object storage, then into the index.</span>
          <span className="ml-auto">Last checked {lastChecked}</span>
        </footer>
      </div>
    </AppLayout>
  );
}
