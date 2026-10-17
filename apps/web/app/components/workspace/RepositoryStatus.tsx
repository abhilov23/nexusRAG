"use client";

import { Check, CircleAlert, Clock3, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type RepoStatus = "Completed" | "Indexing" | "Queued" | "Failed";

interface RepositoryStatusProps {
  status: RepoStatus;
  progress?: number;
  compact?: boolean;
  /** Why it failed, from the worker. Shown instead of a generic message. */
  errorMessage?: string | null;
}

const DOT: Record<RepoStatus, string> = {
  Completed: "bg-[var(--nx-ok)]",
  Indexing: "bg-[var(--nx-warn)]",
  Queued: "bg-[var(--nx-idle)]",
  Failed: "bg-[var(--nx-bad)]",
};

const TEXT: Record<RepoStatus, string> = {
  Completed: "text-[var(--nx-ok)]",
  Indexing: "text-[var(--nx-warn)]",
  Queued: "text-[var(--nx-muted)]",
  Failed: "text-[var(--nx-bad)]",
};

const ICON: Record<RepoStatus, React.ReactNode> = {
  Completed: <Check size={12} />,
  Indexing: <LoaderCircle size={12} className="animate-spin" />,
  Queued: <Clock3 size={12} />,
  Failed: <CircleAlert size={12} />,
};

export function RepositoryStatus({
  status,
  progress,
  compact = false,
  errorMessage,
}: RepositoryStatusProps) {
  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-[var(--nx-border)] bg-[var(--nx-inset)] px-2.5 py-[4px] font-mono text-[10px] font-medium tracking-[0.08em] uppercase",
          TEXT[status],
        )}
      >
        <span className={cn("size-1.5 rounded-full", DOT[status])} aria-hidden="true" />
        {ICON[status]}
        <span>{status}</span>
      </span>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-[var(--nx-border)] bg-[var(--nx-inset)] px-2.5 py-[4px] font-mono text-[10px] font-medium tracking-[0.08em] uppercase",
            TEXT[status],
          )}
        >
          <span className={cn("size-1.5 rounded-full", DOT[status])} aria-hidden="true" />
          {ICON[status]}
          <span>{status}</span>
        </span>
        {status === "Indexing" && progress !== undefined && (
          <span className="font-mono text-[10px] tabular-nums text-[var(--nx-muted)]">
            {progress}%
          </span>
        )}
      </div>
      {status === "Indexing" && progress !== undefined && (
        <div
          className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--nx-track)]"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Indexing progress: ${progress}%`}
        >
          <div
            className="h-full rounded-full bg-[var(--nx-signal)] transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {status === "Failed" && (
        <p
          className="mt-2 text-[11.5px] leading-relaxed text-[var(--nx-bad)]"
          title={errorMessage ?? undefined}
        >
          {errorMessage ?? "Indexing failed. Retry, or check the server logs for details."}
        </p>
      )}
    </div>
  );
}
