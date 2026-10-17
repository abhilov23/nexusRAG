import * as React from "react";
import { cn } from "@/lib/utils";

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-[var(--nx-border)]",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("nx-shimmer rounded-xl bg-[var(--nx-raised)]", className)}
      {...props}
    />
  );
}

function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-1.5 font-mono text-[10px] font-medium text-[var(--nx-muted)]",
        className,
      )}
      {...props}
    />
  );
}

function Eyebrow({
  className,
  dot = true,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.22em] text-[var(--nx-mint)] uppercase",
        className,
      )}
      {...props}
    >
      {dot ? (
        <span aria-hidden="true" className="inline-block h-px w-4 bg-[var(--nx-mint)]" />
      ) : null}
      {props.children}
    </span>
  );
}

export { Separator, Skeleton, Kbd, Eyebrow };
