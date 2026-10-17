import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/workspace" aria-label="NexusRAG home" className="group flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid size-[26px] shrink-0 place-items-center rounded-[9px] border border-[var(--nx-border-strong)] bg-[var(--nx-signal)] transition-transform duration-300 group-hover:-rotate-6"
      >
        <span className="flex -skew-x-[13deg] items-center gap-[2.5px] text-[var(--nx-signal-ink)]">
          <span className="block h-3 w-[3.5px] rounded-full bg-current opacity-60" />
          <span className="block h-[18px] w-[3.5px] rounded-full bg-current" />
          <span className="block h-[13px] w-[3.5px] rounded-full bg-current opacity-75" />
        </span>
      </span>
      {!compact && (
        <span className="font-display text-[18px] font-bold tracking-[-0.03em] text-[var(--nx-ink)]">
          nexus<span className="font-medium text-[var(--nx-faint)]">rag</span>
        </span>
      )}
    </Link>
  );
}

export function NavLink({
  href,
  active,
  icon,
  label,
  badge,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-all duration-200",
        active
          ? "bg-[var(--nx-raised)] text-[var(--nx-ink)] shadow-[inset_0_0_0_1px_var(--nx-border-strong)]"
          : "text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-full bg-[var(--nx-ink)] transition-all duration-200",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-40",
        )}
      />
      <span
        className={cn(
          "transition-transform duration-200 group-hover:scale-110",
          active && "text-[var(--nx-ink)]",
        )}
      >
        {icon}
      </span>
      <span className="tracking-tight">{label}</span>
      {badge ? (
        <span className="ml-auto rounded-md border border-[var(--nx-border)] px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-[var(--nx-muted)]">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
