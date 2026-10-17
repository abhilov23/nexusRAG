"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Clock3,
  GitBranch,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { AppLayout } from "@/app/components/AppLayout";
import { WorkspaceHeader } from "@/app/components/workspace/WorkspaceHeader";
import { WorkspaceCTA } from "@/app/components/workspace/WorkspaceCTA";
import { WorkspaceStats } from "@/app/components/workspace/WorkspaceStats";
import { RepositorySection } from "@/app/components/workspace/RepositorySection";
import { RepositoryStatus } from "@/app/components/workspace/RepositoryStatus";
import {
  ApiError,
  deleteRepository,
  listRepositories,
  submitRepository,
  type RepositoryStatus as ApiStatus,
} from "@/lib/repositories/client";
import { formatBytes, formatRelative } from "@/lib/repositories/format";

type RepoStatus = "Completed" | "Indexing" | "Queued" | "Failed";
type Repo = {
  id: string;
  name: string;
  language: string;
  color: string;
  status: RepoStatus;
  indexed: string;
  branch: string;
  bytes: number | null;
  errorMessage: string | null;
  sourceFile: string;
};

function toDisplayStatus(status: ApiStatus): RepoStatus {
  switch (status) {
    case "READY":
      return "Completed";
    case "FAILED":
      return "Failed";
    case "QUEUED":
      return "Queued";
    default:
      return "Indexing";
  }
}

export default function WorkspacePage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [repoError, setRepoError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [lastSync, setLastSync] = useState("never");
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Repo | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const rows = await listRepositories(controller.signal);
      setRepos(
        rows.map((row) => ({
          id: row.id,
          name: `${row.owner} / ${row.name}`,
          language: row.language ?? "Detecting",
          color: "",
          status: toDisplayStatus(row.status),
          indexed: row.lastIngestedAt ? formatRelative(row.lastIngestedAt) : "Not ingested yet",
          branch: row.defaultBranch ?? "default",
          bytes: row.sizeBytes,
          errorMessage: row.errorMessage,
          sourceFile: "",
        })),
      );
      setLastSync("just now");
      setLoadError(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setLoadError("Repositories took too long to load. Check your connection and retry.");
      } else {
        setLoadError(
          error instanceof ApiError ? error.message : "Could not load your repositories.",
        );
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(true);
  }, [load]);

  useEffect(() => {
    if (!confirmDelete) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmDelete(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const search = document.getElementById("repo-search");
      if (search) {
        event.preventDefault();
        search.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hasActive = repos.some((r) => r.status === "Indexing" || r.status === "Queued");
  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => void load(true), 4000);
    return () => window.clearInterval(timer);
  }, [hasActive, load]);

  const startIndexing = async (name: string) => {
    setLoadError(null);
    try {
      const rows = await listRepositories();
      const target = rows.find((row) => `${row.owner} / ${row.name}` === name);
      if (!target) return;
      await submitRepository(target.githubUrl);
      await load(true);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : "Could not queue this repository.");
    }
  };

  const addRepository = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = repoUrl.trim();
    if (!trimmed) {
      setRepoError("Enter a repository URL.");
      return;
    }
    setSubmitting(true);
    setRepoError("");
    try {
      await submitRepository(trimmed);
      setRepoUrl("");
      setAddOpen(false);
      await load(true);
    } catch (error) {
      setRepoError(
        error instanceof ApiError ? error.message : "Could not connect this repository.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRepositoryByName = async (name: string) => {
    setLoadError(null);
    setDeleting(true);
    try {
      const rows = await listRepositories();
      const target = rows.find((row) => `${row.owner} / ${row.name}` === name);
      if (!target) {
        setConfirmDelete(null);
        return;
      }
      await deleteRepository(target.id);
      if (selectedRepo?.name === name) setSelectedRepo(null);
      setConfirmDelete(null);
      await load(true);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : "Could not remove this repository.");
    } finally {
      setDeleting(false);
    }
  };

  const requestDelete = (name: string) => {
    const repo = repos.find((r) => r.name === name) ?? null;
    setConfirmDelete(repo);
  };

  const ready = repos.filter((r) => r.status === "Completed").length;
  const activeCount = repos.filter((r) => r.status === "Indexing" || r.status === "Queued").length;

  return (
    <AppLayout>
      <div className="relative w-full px-5 pt-8 pb-14 sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 left-1/2 h-[320px] w-[760px] -translate-x-1/2 rounded-full bg-[var(--nx-ink)] opacity-[0.035] blur-3xl"
        />
        <WorkspaceHeader
          onAddClick={() => setAddOpen(true)}
          total={repos.length}
          ready={ready}
          active={activeCount}
          lastSync={lastSync}
        />

        <div className="mt-6">
          <WorkspaceStats repos={repos} lastSync={lastSync} />
        </div>

        {loading && repos.length === 0 && !loadError && (
          <div
            className="mt-6 overflow-hidden rounded-2xl border border-[var(--nx-border)]"
            role="status"
            aria-label="Loading repositories"
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="nx-shimmer flex items-center gap-3 border-b border-[var(--nx-border)] px-4 py-4 last:border-b-0"
              >
                <div className="size-10 rounded-xl bg-[var(--nx-raised)]" />
                <div className="flex-1">
                  <div className="h-3.5 w-48 rounded bg-[var(--nx-raised)]" />
                  <div className="mt-2 h-3 w-32 rounded bg-[var(--nx-raised)]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {repos.length === 0 && !loading && !loadError && (
          <div className="mt-6">
            <WorkspaceCTA onActionClick={() => setAddOpen(true)} />
          </div>
        )}

        {loadError && (
          <div
            role="alert"
            className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--nx-bad)] bg-[color-mix(in_srgb,var(--nx-bad)_8%,transparent)] px-4 py-3"
          >
            <p className="text-[12.5px] text-[var(--nx-bad)]">{loadError}</p>
            <button
              onClick={() => void load(false)}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3 text-[12px] font-medium text-[var(--nx-ink)] transition-colors hover:border-[var(--nx-border-strong)]"
            >
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        )}

        {(repos.length > 0 || (!loading && !loadError)) && (
          <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <RepositorySection
              repos={repos}
              filter={filter}
              onFilterChange={setFilter}
              sortBy={sortBy}
              onSortChange={setSortBy}
              onAddClick={() => setAddOpen(true)}
              onReindex={startIndexing}
              onDelete={requestDelete}
              onViewDetails={setSelectedRepo}
              selectedRepo={selectedRepo}
              onSelectRepo={setSelectedRepo}
            />

            <aside className="grid gap-4 xl:sticky xl:top-[76px]">
              <div className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-5">
                <p className="flex items-center justify-between font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
                  <span>Pipeline</span>
                  <span className="inline-flex items-center gap-1.5 tracking-[0.1em]">
                    <span
                      aria-hidden="true"
                      className={
                        hasActive
                          ? "size-1.5 animate-pulse rounded-full bg-[var(--nx-warn)]"
                          : "size-1.5 rounded-full bg-[var(--nx-ok)]"
                      }
                    />
                    <span
                      className={hasActive ? "text-[var(--nx-warn)]" : "text-[var(--nx-muted)]"}
                    >
                      {hasActive ? "live" : "idle"}
                    </span>
                  </span>
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10.5px] text-[var(--nx-muted)]">
                  {["DOC", "CHUNK", "EMB", "VEC", "LEX", "GRAPH", "ANS"].map((s, i) => (
                    <span key={s} className="flex items-center gap-1.5">
                      <span
                        className={
                          hasActive && (s === "CHUNK" || s === "EMB" || s === "VEC")
                            ? "rounded-md border border-[var(--nx-warn)] bg-[var(--nx-inset)] px-1.5 py-1 text-[var(--nx-warn)]"
                            : "rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-1.5 py-1"
                        }
                      >
                        {s}
                      </span>
                      {i < 6 && (
                        <span aria-hidden="true" className="text-[var(--nx-faint)]">
                          →
                        </span>
                      )}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-[var(--nx-muted)]">
                  Tree-sitter chunks · 1536-d vectors · RRF fusion · cited answers.
                </p>
                <div className="mt-4 grid gap-2">
                  <Link
                    href="/chat"
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[var(--nx-signal)] px-4 text-[13px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85"
                  >
                    Ask the index <ArrowUpRight size={14} />
                  </Link>
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href="/graph"
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--nx-border)] px-3 text-[12.5px] text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
                    >
                      Graph
                    </Link>
                    <Link
                      href="/sync"
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--nx-border)] px-3 text-[12.5px] text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
                    >
                      Queue
                    </Link>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-5">
                <p className="font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
                  How to read this
                </p>
                <ul className="mt-3 space-y-2.5 text-[12px] leading-relaxed text-[var(--nx-muted)]">
                  <li className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--nx-ok)]" />
                    Ready — ask it, answers cite files and lines.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--nx-warn)]" />
                    Indexing — worker is parsing and embedding; polls live.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--nx-bad)]" />
                    Failed — the worker message shows below the row.
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        )}

        {confirmDelete && (
          <div
            className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !deleting) setConfirmDelete(null);
            }}
          >
            <section
              className="w-full max-w-[420px] rounded-2xl border border-[var(--nx-border-strong)] bg-[var(--nx-surface)] p-6"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-title"
              aria-describedby="delete-description"
            >
              <span className="grid size-10 place-items-center rounded-xl border border-[var(--nx-bad)] bg-[color-mix(in_srgb,var(--nx-bad)_10%,transparent)] text-[var(--nx-bad)]">
                <Trash2 size={18} />
              </span>
              <h2
                id="delete-title"
                className="font-display mt-4 text-[19px] font-semibold tracking-tight text-[var(--nx-ink)]"
              >
                Remove repository?
              </h2>
              <p
                id="delete-description"
                className="mt-1.5 text-[13px] leading-relaxed text-[var(--nx-muted)]"
              >
                <strong className="font-semibold text-[var(--nx-ink)]">{confirmDelete.name}</strong>{" "}
                will be removed from the workspace and its index will be deleted. This cannot be
                undone.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  disabled={deleting}
                  autoFocus
                  className="h-10 rounded-xl border border-[var(--nx-border)] px-4 text-[13px] text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void deleteRepositoryByName(confirmDelete.name)}
                  disabled={deleting}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--nx-bad)] px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                >
                  {deleting ? (
                    <LoaderCircle size={15} className="animate-spin" />
                  ) : (
                    <Trash2 size={15} />
                  )}
                  {deleting ? "Removing…" : "Delete"}
                </button>
              </div>
            </section>
          </div>
        )}

        {selectedRepo && (
          <div
            className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedRepo(null);
            }}
          >
            <section
              className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-[var(--nx-border-strong)] bg-[var(--nx-surface)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="repo-detail-title"
            >
              <div className="flex items-center justify-between border-b border-[var(--nx-border)] px-5 py-3.5">
                <p className="font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
                  Repository
                </p>
                <button
                  onClick={() => setSelectedRepo(null)}
                  aria-label="Close repository details"
                  className="grid size-8 place-items-center rounded-lg text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="px-5 py-5">
                <h2
                  id="repo-detail-title"
                  className="font-display truncate text-[22px] font-semibold tracking-tight text-[var(--nx-ink)]"
                >
                  {selectedRepo.name}
                </h2>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[var(--nx-faint)]">
                  <span className="inline-flex items-center gap-1">
                    <GitBranch size={12} /> {selectedRepo.branch}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedRepo.language}</span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedRepo.indexed}</span>
                </p>

                <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--nx-border)] bg-[var(--nx-border)]">
                  <div className="bg-[var(--nx-surface)] px-4 py-3">
                    <p className="font-mono text-[9.5px] tracking-[0.18em] text-[var(--nx-faint)] uppercase">
                      Status
                    </p>
                    <div className="mt-2">
                      <RepositoryStatus
                        status={selectedRepo.status}
                        errorMessage={undefined}
                        compact
                      />
                    </div>
                    {selectedRepo.errorMessage && selectedRepo.status === "Failed" && (
                      <p
                        className="mt-2 line-clamp-3 text-[11.5px] leading-relaxed text-[var(--nx-bad)]"
                        title={selectedRepo.errorMessage}
                      >
                        {selectedRepo.errorMessage}
                      </p>
                    )}
                  </div>
                  <div className="bg-[var(--nx-surface)] px-4 py-3">
                    <p className="font-mono text-[9.5px] tracking-[0.18em] text-[var(--nx-faint)] uppercase">
                      Archive
                    </p>
                    <p className="mt-2 font-mono text-[15px] tabular-nums text-[var(--nx-ink)]">
                      {formatBytes(selectedRepo.bytes)}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--nx-muted)]">
                      <Clock3 size={11} /> {selectedRepo.indexed}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/chat?repo=${encodeURIComponent(selectedRepo.id)}`}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--nx-signal)] px-4 text-[13px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85"
                    onClick={() => setSelectedRepo(null)}
                  >
                    Ask this repository <ArrowUpRight size={15} />
                  </Link>
                  <button
                    onClick={() => {
                      void startIndexing(selectedRepo.name);
                      setSelectedRepo(null);
                    }}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--nx-border)] px-4 text-[13px] text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
                  >
                    <RefreshCw size={14} /> Re-index
                  </button>
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-[var(--nx-muted)]">
                  <Check size={12} className="text-[var(--nx-ok)]" />
                  {selectedRepo.status === "Completed"
                    ? "Indexed — answers from this repo carry file and line citations."
                    : selectedRepo.status === "Failed"
                      ? "Indexing failed — the message above is the worker's reason."
                      : "Indexing in progress — this dialog refreshes with the list."}
                </p>
              </div>
            </section>
          </div>
        )}

        {addOpen && (
          <div
            className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setAddOpen(false);
            }}
          >
            <section
              className="w-full max-w-[440px] rounded-2xl border border-[var(--nx-border-strong)] bg-[var(--nx-surface)] p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-title"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-[var(--nx-signal)] text-[var(--nx-signal-ink)]">
                  <GitBranch size={18} />
                </span>
                <button
                  onClick={() => setAddOpen(false)}
                  aria-label="Close"
                  className="grid size-8 place-items-center rounded-lg text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
                >
                  <X size={17} />
                </button>
              </div>
              <p className="mt-4 font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
                New index
              </p>
              <h2
                id="add-title"
                className="font-display mt-1 text-[22px] font-semibold tracking-tight text-[var(--nx-ink)]"
              >
                Add a repository
              </h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--nx-muted)]">
                Public GitHub only. Unchanged commits are skipped automatically.
              </p>
              <form onSubmit={addRepository} className="mt-5">
                <label
                  htmlFor="repo-url"
                  className="mb-1.5 block text-[12px] font-semibold text-[var(--nx-ink)]"
                >
                  Repository URL
                </label>
                <div className="flex h-11 items-center gap-2 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-inset)] px-3 transition-colors focus-within:border-[var(--nx-signal)]">
                  <GitBranch size={15} className="shrink-0 text-[var(--nx-faint)]" />
                  <input
                    id="repo-url"
                    autoFocus
                    value={repoUrl}
                    onChange={(event) => {
                      setRepoUrl(event.target.value);
                      setRepoError("");
                    }}
                    placeholder="https://github.com/org/repository"
                    className="w-full bg-transparent text-[13px] text-[var(--nx-ink)] outline-none placeholder:text-[var(--nx-faint)]"
                  />
                </div>
                {repoError && (
                  <p className="mt-2 text-[12px] text-[var(--nx-bad)]" role="alert">
                    {repoError}
                  </p>
                )}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAddOpen(false)}
                    className="h-10 rounded-xl border border-[var(--nx-border)] px-4 text-[13px] text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--nx-signal)] px-4 text-[13px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85 disabled:opacity-60"
                  >
                    {submitting ? (
                      <LoaderCircle size={15} className="animate-spin" />
                    ) : (
                      <Plus size={15} />
                    )}
                    {submitting ? "Queueing" : "Connect"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
