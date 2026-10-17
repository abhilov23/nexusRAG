"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./primitives";

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-7 flex flex-wrap items-end justify-between gap-5", className)}>
      <div className="min-w-0 max-w-[640px]">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="font-display mt-3 text-balance text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.04] tracking-[-0.03em] text-[var(--nx-ink)]">
          {title}
        </h1>
        {lede ? (
          <p className="mt-2.5 max-w-[560px] text-pretty text-[13.5px] leading-relaxed text-[var(--nx-muted)]">
            {lede}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>
      ) : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  icon,
  accent = "mint",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: "mint" | "amber" | "violet" | "rose" | "cyan";
  className?: string;
}) {
  const bars: Record<string, string> = {
    mint: "from-[var(--nx-ink)] to-transparent",
    amber: "from-[var(--nx-faint)] to-[var(--nx-ink)]",
    violet: "from-[var(--nx-faint)] to-[var(--nx-ink)]",
    rose: "from-[var(--nx-bad)] to-transparent",
    cyan: "from-[var(--nx-faint)] to-[var(--nx-ink)]",
  };
  return (
    <div
      className={cn(
        "nx-card group relative overflow-hidden rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--nx-border-strong)] hover:shadow-[0_24px_60px_-32px_rgba(0,0,0,0.8)]",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r opacity-70",
          bars[accent],
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--nx-faint)]">
          {label}
        </p>
        {icon ? (
          <span className="text-[var(--nx-faint)] transition-colors group-hover:text-[var(--nx-ink)]">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="font-display mt-2.5 text-[32px] font-semibold leading-none tracking-[-0.03em] text-[var(--nx-ink)] tabular-nums">
        {value}
      </p>
      {sub ? <p className="mt-2 text-xs leading-relaxed text-[var(--nx-muted)]">{sub}</p> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-[var(--nx-border-strong)] bg-[color-mix(in_srgb,var(--nx-surface)_70%,transparent)] px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-[var(--nx-border-strong)] bg-[var(--nx-raised)] text-[var(--nx-ink)]">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-lg font-semibold tracking-tight text-[var(--nx-ink)]">
        {title}
      </h3>
      {body ? (
        <p className="mt-2 max-w-[420px] text-[13px] leading-relaxed text-[var(--nx-muted)]">
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
