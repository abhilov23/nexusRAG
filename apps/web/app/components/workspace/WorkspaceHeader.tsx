"use client";

import { Activity, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkspaceHeaderProps {
  onAddClick: () => void;
  total: number;
  ready: number;
  active: number;
  lastSync: string;
}

export function WorkspaceHeader({
  onAddClick,
  total,
  ready,
  active,
  lastSync,
}: WorkspaceHeaderProps) {
  return (
    <header className="relative flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
          01 — Workspace
        </p>
        <h1 className="font-display mt-2 text-[clamp(30px,3.6vw,42px)] leading-[1.02] font-semibold tracking-[-0.03em] text-balance text-[var(--nx-ink)]">
          Repositories
        </h1>
        {total === 0 ? (
          <p className="mt-2 max-w-[56ch] text-[13.5px] leading-relaxed text-[var(--nx-muted)]">
            Connect your first repository. Every answer afterwards cites its source.
          </p>
        ) : (
          <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-[var(--nx-muted)]">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-[var(--nx-border)] bg-[var(--nx-surface)] px-2.5 py-[3px] font-mono text-[10px] tracking-[0.14em] uppercase",
                active > 0 ? "text-[var(--nx-warn)]" : "text-[var(--nx-muted)]",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  active > 0 ? "animate-pulse bg-[var(--nx-warn)]" : "bg-[var(--nx-ok)]",
                )}
              />
              {active > 0 ? `indexing ${active}` : "indexer idle"}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-[var(--nx-ink)]">
              {ready}/{total} ready
            </span>
            <span aria-hidden="true" className="text-[var(--nx-border-strong)]">
              ·
            </span>
            <span className="text-[12.5px]">synced {lastSync}</span>
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href="/sync"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)] px-4 text-[13px] font-medium text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
        >
          <Activity size={15} />
          Sync status
        </a>
        <button
          onClick={onAddClick}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--nx-signal)] px-4 text-[13px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85 active:scale-[0.98]"
        >
          <Plus size={16} />
          Add repository
        </button>
      </div>
    </header>
  );
}
