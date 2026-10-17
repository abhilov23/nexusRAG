"use client";

import { motion, AnimatePresence } from "framer-motion";
import { RepositoryCard } from "./RepositoryCard";
import { RepositoryFilters } from "./RepositoryFilters";
import { FolderPlus, SearchX } from "lucide-react";

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
  progress?: number;
};

interface RepositorySectionProps {
  repos: Repo[];
  filter: string;
  onFilterChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  onAddClick: () => void;
  onReindex: (name: string) => void;
  onDelete: (name: string) => void;
  onViewDetails: (repo: Repo) => void;
  selectedRepo: Repo | null;
  onSelectRepo: (repo: Repo | null) => void;
}

export function RepositorySection({
  repos,
  filter,
  onFilterChange,
  sortBy,
  onSortChange,
  onAddClick,
  onReindex,
  onDelete,
  onViewDetails,
  selectedRepo,
  onSelectRepo,
}: RepositorySectionProps) {
  void selectedRepo;

  const sortedRepos = [...repos].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "status") {
      const rank: Record<RepoStatus, number> = { Indexing: 0, Queued: 1, Failed: 2, Completed: 3 };
      return rank[a.status] - rank[b.status] || a.name.localeCompare(b.name);
    }
    return 0;
  });

  const q = filter.trim().toLowerCase();
  const filteredRepos = q
    ? sortedRepos.filter(
        (repo) => repo.name.toLowerCase().includes(q) || repo.language.toLowerCase().includes(q),
      )
    : sortedRepos;

  return (
    <section aria-labelledby="repositories-heading">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
            02 — Repositories
          </p>
          <div className="mt-2 flex items-baseline gap-3">
            <h2
              id="repositories-heading"
              className="font-display text-[22px] font-semibold tracking-tight text-[var(--nx-ink)]"
            >
              Index
            </h2>
            <span className="font-mono text-[11px] tabular-nums text-[var(--nx-faint)]">
              {filteredRepos.length}/{repos.length}
            </span>
          </div>
        </div>
        <RepositoryFilters
          filter={filter}
          onFilterChange={onFilterChange}
          sortBy={sortBy}
          onSortChange={onSortChange}
          count={filteredRepos.length}
        />
      </header>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)]">
        <div
          aria-hidden="true"
          className="hidden grid-cols-[40px_minmax(0,1.5fr)_auto_minmax(0,1fr)_auto] gap-x-5 border-b border-[var(--nx-border)] bg-[var(--nx-inset)] px-4 py-2.5 font-mono text-[10px] tracking-[0.18em] text-[var(--nx-faint)] uppercase sm:grid"
        >
          <span>No.</span>
          <span>Repository</span>
          <span>Status</span>
          <span className="text-right">Storage</span>
          <span className="text-right">Actions</span>
        </div>

        <motion.div layout role="list" aria-label="Repositories">
          <AnimatePresence initial={false}>
            {filteredRepos.map((repo, i) => (
              <div key={repo.id} role="listitem">
                <RepositoryCard
                  repo={repo}
                  index={i}
                  onClick={() => onSelectRepo(repo)}
                  onReindex={onReindex}
                  onDelete={onDelete}
                  onViewDetails={onViewDetails}
                />
              </div>
            ))}
          </AnimatePresence>

          <button
            onClick={onAddClick}
            aria-label="Add a new repository"
            className="group flex w-full items-center gap-3.5 px-4 py-4 text-left transition-colors hover:bg-[var(--nx-raised)]"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-dashed border-[var(--nx-border-strong)] text-[var(--nx-muted)] transition-colors group-hover:border-[var(--nx-signal)] group-hover:text-[var(--nx-signal)]">
              <FolderPlus size={18} />
            </span>
            <span className="min-w-0">
              <strong className="block text-[13.5px] font-semibold tracking-tight text-[var(--nx-ink)]">
                Connect a repository
              </strong>
              <span className="block truncate font-mono text-[11px] text-[var(--nx-faint)]">
                https://github.com/org/repo → archive → parse → index
              </span>
            </span>
            <span className="ml-auto hidden shrink-0 font-mono text-[11px] text-[var(--nx-faint)] transition-colors group-hover:text-[var(--nx-signal)] sm:block">
              paste URL →
            </span>
          </button>
        </motion.div>
      </div>

      {filteredRepos.length === 0 && repos.length > 0 && (
        <div
          className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-[var(--nx-border-strong)] px-5 py-6"
          role="status"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--nx-raised)] text-[var(--nx-faint)]">
            <SearchX size={18} />
          </span>
          <div>
            <strong className="block text-[13.5px] font-semibold tracking-tight text-[var(--nx-ink)]">
              No matches for “{filter.trim()}”
            </strong>
            <span className="mt-0.5 block text-[12px] text-[var(--nx-muted)]">
              Try a repository name or a language like “typescript”.
            </span>
          </div>
          <button
            onClick={() => onFilterChange("")}
            className="ml-auto h-8 shrink-0 rounded-lg border border-[var(--nx-border)] px-3 text-[12px] text-[var(--nx-muted)] hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
          >
            Clear
          </button>
        </div>
      )}
    </section>
  );
}
