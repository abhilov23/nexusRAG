"use client";

import { formatBytes } from "@/lib/repositories/stats";
import { cn } from "@/lib/utils";

interface WorkspaceStatsProps {
  repos: Array<{
    name: string;
    language: string;
    bytes: number | null;
    status: string;
  }>;
  lastSync: string;
}

/**
 * Four-stat hairline band. All numbers derive from the real repository list —
 * no sample metrics, no placeholders.
 */
export function WorkspaceStats({ repos, lastSync }: WorkspaceStatsProps) {
  const total = repos.length;
  const ready = repos.filter((r) => r.status === "Completed").length;
  const active = repos.filter((r) => r.status === "Indexing" || r.status === "Queued").length;
  const failed = repos.filter((r) => r.status === "Failed").length;
  const storedBytes = repos.reduce((sum, r) => sum + (r.bytes ?? 0), 0);
  const storedCount = repos.filter((r) => r.bytes).length;
  const pct = total === 0 ? 0 : Math.round((ready / total) * 100);

  const cells = [
    {
      label: "Indexed",
      value: total === 0 ? "—" : `${pct}%`,
      note: total === 0 ? "nothing connected" : `${ready} of ${total} ready`,
      live: false,
      tone: "",
    },
    {
      label: "In progress",
      value: String(active),
      note: active > 0 ? "polling every 4s" : "queue idle",
      live: active > 0,
      tone: active > 0 ? "text-[var(--nx-warn)]" : "",
    },
    {
      label: "Needs attention",
      value: String(failed),
      note: failed > 0 ? "failed — retry below" : "no failures",
      live: false,
      tone: failed > 0 ? "text-[var(--nx-bad)]" : "",
    },
    {
      label: "Archive stored",
      value: formatBytes(storedBytes),
      note:
        storedCount > 0 ? `${storedCount} of ${total} stored · ${lastSync}` : "nothing stored yet",
      live: false,
      tone: "",
    },
  ];

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)]"
      aria-label="Workspace statistics"
    >
      {total > 0 && (
        <div className="flex h-[3px] gap-px" aria-hidden="true">
          {ready > 0 && (
            <span
              className="h-full bg-[color-mix(in_srgb,var(--nx-ok)_65%,transparent)]"
              style={{ width: `${(ready / total) * 100}%` }}
            />
          )}
          {active > 0 && (
            <span
              className="h-full animate-pulse bg-[color-mix(in_srgb,var(--nx-warn)_70%,transparent)]"
              style={{ width: `${(active / total) * 100}%` }}
            />
          )}
          {failed > 0 && (
            <span
              className="h-full bg-[color-mix(in_srgb,var(--nx-bad)_70%,transparent)]"
              style={{ width: `${(failed / total) * 100}%` }}
            />
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-px bg-[var(--nx-border)] lg:grid-cols-4">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="bg-[var(--nx-surface)] px-5 py-4 transition-colors hover:bg-[var(--nx-raised)]"
          >
            <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] text-[var(--nx-faint)] uppercase">
              {cell.live && (
                <span
                  className="size-1.5 animate-pulse rounded-full bg-[var(--nx-warn)]"
                  aria-hidden="true"
                />
              )}
              {cell.label}
            </p>
            <p
              className={cn(
                "font-display mt-1.5 text-[28px] leading-none font-semibold tracking-tight tabular-nums text-[var(--nx-ink)]",
                cell.tone,
              )}
            >
              {cell.value}
            </p>
            <p className="mt-1.5 truncate text-[11.5px] text-[var(--nx-muted)]" title={cell.note}>
              {cell.note}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
