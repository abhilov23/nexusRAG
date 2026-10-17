"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Clock3, FolderGit2, GitBranch, RefreshCw, Trash2 } from "lucide-react";
import { RepositoryStatus } from "./RepositoryStatus";
import { formatBytes } from "@/lib/repositories/stats";
import { cn } from "@/lib/utils";

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

interface RepositoryCardProps {
  repo: Repo;
  index: number;
  onClick: () => void;
  onReindex: (name: string) => void;
  onDelete: (name: string) => void;
  onViewDetails: (repo: Repo) => void;
}

/**
 * Ledger row, monochrome by design. The only color on the row is the
 * semantic status dot — repository identity never gets a rainbow.
 */
export function RepositoryCard({
  repo,
  index,
  onClick,
  onReindex,
  onDelete,
  onViewDetails,
}: RepositoryCardProps) {
  const active = repo.status === "Indexing" || repo.status === "Queued";
  const num = String(index + 1).padStart(2, "0");

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.21, 0.65, 0.25, 1] }}
      className="group relative cursor-pointer border-b border-[var(--nx-border)] transition-colors last:border-b-0 hover:bg-[var(--nx-raised)]"
      role="button"
      tabIndex={0}
      aria-label={`Open details for ${repo.name}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 px-4 py-4 sm:grid-cols-[40px_minmax(0,1.5fr)_auto_minmax(0,1fr)_auto] sm:gap-x-5">
        <span
          className="hidden font-mono text-[11px] tabular-nums text-[var(--nx-faint)] sm:block"
          aria-hidden="true"
        >
          {num}
        </span>

        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--nx-border)] bg-[var(--nx-inset)] text-[var(--nx-muted)] transition-colors group-hover:border-[var(--nx-border-strong)] group-hover:text-[var(--nx-ink)]"
          >
            <FolderGit2 size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-semibold tracking-tight text-[var(--nx-ink)]">
              {repo.name}
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-[var(--nx-faint)]">
              <span className="rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-1.5 py-[1px] text-[10.5px] text-[var(--nx-muted)]">
                {repo.language}
              </span>
              <span className="inline-flex items-center gap-1">
                <GitBranch size={11} aria-hidden="true" />
                {repo.branch}
              </span>
              <span aria-hidden="true" className="hidden text-[var(--nx-border-strong)] sm:inline">
                ·
              </span>
              <span className="hidden items-center gap-1 sm:inline-flex">
                <Clock3 size={11} aria-hidden="true" />
                {repo.indexed}
              </span>
            </p>
            {repo.status === "Failed" && repo.errorMessage && (
              <p
                className="mt-1 truncate text-[11.5px] text-[var(--nx-bad)]"
                title={repo.errorMessage}
              >
                {repo.errorMessage}
              </p>
            )}
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1">
          <RepositoryStatus status={repo.status} errorMessage={undefined} compact />
        </div>

        <div className="hidden min-w-0 text-right sm:block">
          <p className="font-mono text-[11.5px] tabular-nums text-[var(--nx-muted)]">
            {formatBytes(repo.bytes)}
          </p>
          <p className="mt-0.5 font-mono text-[10px] tracking-[0.08em] text-[var(--nx-faint)] uppercase">
            archive
          </p>
        </div>

        <div
          className="col-span-2 flex flex-wrap items-center gap-1.5 sm:col-span-1 sm:justify-end"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Link
            href={`/chat?repo=${encodeURIComponent(repo.id)}`}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[12px] font-semibold transition-colors",
              repo.status === "Completed"
                ? "bg-[var(--nx-signal)] text-[var(--nx-signal-ink)] hover:opacity-85"
                : "border border-[var(--nx-border)] text-[var(--nx-muted)] hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]",
            )}
            aria-label={`Ask ${repo.name}`}
          >
            Ask <ArrowUpRight size={13} />
          </Link>
          <button
            onClick={() => onViewDetails(repo)}
            className="inline-flex h-8 items-center rounded-lg border border-[var(--nx-border)] bg-transparent px-3 text-[12px] font-medium text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
          >
            Details
          </button>
          <button
            onClick={() => onReindex(repo.name)}
            disabled={active}
            title={active ? "Already indexing" : `Re-index ${repo.name}`}
            className="grid size-8 place-items-center rounded-lg border border-[var(--nx-border)] text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)] disabled:cursor-wait disabled:opacity-40"
            aria-label={`Re-index ${repo.name}`}
          >
            <RefreshCw size={14} className={active ? "animate-spin" : undefined} />
          </button>
          <button
            onClick={() => onDelete(repo.name)}
            title={`Remove ${repo.name}`}
            className="grid size-8 place-items-center rounded-lg border border-transparent text-[var(--nx-faint)] transition-colors hover:border-[var(--nx-bad)] hover:text-[var(--nx-bad)]"
            aria-label={`Remove ${repo.name}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {active && (
        <div
          className="nx-shimmer absolute inset-x-0 bottom-0 h-[2px] bg-[var(--nx-track)]"
          role="progressbar"
          aria-label={`Indexing ${repo.name}`}
        >
          <div className="h-full w-1/3 bg-[var(--nx-signal)]" />
        </div>
      )}
    </motion.article>
  );
}
