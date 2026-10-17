"use client";

import Link from "next/link";

const COLS = [
  {
    title: "Product",
    links: [
      { label: "Pipeline", href: "#journey" },
      { label: "Code graph", href: "#graph" },
      { label: "Example queries", href: "#queries" },
      { label: "Stack", href: "#stack" },
    ],
  },
  {
    title: "App",
    links: [
      { label: "Workspace", href: "/workspace" },
      { label: "Chat", href: "/chat" },
      { label: "Sync status", href: "/sync" },
      { label: "Help", href: "/help" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    title: "Stack",
    links: [
      { label: "Tree-sitter", href: "#stack" },
      { label: "Qdrant", href: "#stack" },
      { label: "Neo4j", href: "#stack" },
      { label: "Elasticsearch", href: "#stack" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-[var(--nx-border)]">
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-16 sm:px-8">
        <div className="grid gap-12 pb-16 md:grid-cols-[1.2fr_2fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="grid size-[26px] shrink-0 place-items-center rounded-[9px] bg-[var(--nx-signal)]"
              >
                <span className="flex -skew-x-[13deg] items-center gap-[2.5px] text-[var(--nx-signal-ink)]">
                  <span className="block h-3 w-[3.5px] rounded-full bg-current opacity-60" />
                  <span className="block h-[18px] w-[3.5px] rounded-full bg-current" />
                  <span className="block h-[13px] w-[3.5px] rounded-full bg-current opacity-75" />
                </span>
              </span>
              <span className="nx2-display text-[18px] font-bold tracking-[-0.03em] text-[var(--nx-ink)]">
                nexus<span className="font-medium text-[var(--nx-faint)]">rag</span>
              </span>
            </div>
            <p className="mt-4 max-w-[34ch] text-[13.5px] leading-relaxed text-[var(--nx-muted)]">
              AI-powered repository intelligence. Understand the codebase — not just the code.
            </p>
            <p className="mt-5 flex items-center gap-2 nx2-mono text-[11px] tracking-[0.12em] text-[var(--nx-muted)] uppercase">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--nx-ink)] opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-[var(--nx-ink)]" />
              </span>
              <Link href="/workspace" className="transition-colors hover:text-[var(--nx-ink)]">
                Check live status in the app
              </Link>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLS.map((col) => (
              <div key={col.title}>
                <p className="nx2-mono text-[10.5px] tracking-[0.2em] text-[var(--nx-faint)] uppercase">
                  {col.title}
                </p>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        className="text-[13.5px] text-[var(--nx-muted)] transition-colors hover:text-[var(--nx-ink)]"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="overflow-hidden px-2 select-none">
        <p className="nx2-display nx2-outline mx-auto max-w-[1240px] text-center text-[clamp(3.4rem,13.5vw,12rem)] leading-[0.85] font-bold tracking-[-0.04em] whitespace-nowrap">
          NEXUSRAG
        </p>
      </div>
      <div className="border-t border-[var(--nx-border)]">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-2 px-5 py-5 nx2-mono text-[10.5px] tracking-[0.1em] text-[var(--nx-faint)] uppercase sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© 2026 NexusRAG — MIT licensed</span>
          <span>Retrieval first · Grounded always</span>
        </div>
      </div>
    </footer>
  );
}
