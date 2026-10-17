import * as React from "react";
import { cn } from "@/lib/utils";

export function Avatar({
  children,
  className,
  tone = "mint",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: "mint" | "sand" | "violet" | "rose" }) {
  const tones = {
    mint: "border-[var(--nx-border-strong)] bg-[var(--nx-signal)] text-[var(--nx-signal-ink)]",
    sand: "border-[var(--nx-border-strong)] bg-[var(--nx-raised)] text-[var(--nx-ink)]",
    violet: "border-[var(--nx-border-strong)] bg-[var(--nx-raised)] text-[var(--nx-muted)]",
    rose: "border-[var(--nx-bad)] bg-[color-mix(in_srgb,var(--nx-bad)_10%,transparent)] text-[var(--nx-bad)]",
  } as const;
  return (
    <div
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full border text-[11px] font-bold tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[var(--nx-track)]", className)}
    >
      <div
        className="h-full rounded-full bg-[var(--nx-mint)] transition-[width] duration-700 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Dot({
  className,
  tone = "mint",
}: {
  className?: string;
  tone?: "mint" | "amber" | "rose" | "muted";
}) {
  const tones = {
    mint: "bg-[var(--nx-ink)]",
    amber: "bg-[var(--nx-muted)]",
    rose: "bg-[var(--nx-bad)]",
    muted: "bg-[var(--nx-idle)]",
  } as const;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-1.5 rounded-full", tones[tone], className)}
    />
  );
}
