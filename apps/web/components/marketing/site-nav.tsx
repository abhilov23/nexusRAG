"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { ThemeToggle } from "@/app/components/workspace/ThemeToggle";

const LINKS = [
  { href: "#journey", label: "01 · Pipeline" },
  { href: "#graph", label: "02 · Graph" },
  { href: "#queries", label: "03 · Queries" },
  { href: "#stack", label: "04 · Stack" },
];

function Mark() {
  return (
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
  );
}

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-[var(--nx-border)] bg-[var(--nx-bg)]"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-[68px] w-full max-w-[1240px] items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label="NexusRAG home">
          <Mark />
          <span className="nx2-display text-[18px] font-bold tracking-[-0.03em] text-[var(--nx-ink)]">
            nexus<span className="font-medium text-[var(--nx-faint)]">rag</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Sections">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="nx2-mono text-[11px] tracking-[0.14em] text-[var(--nx-muted)] uppercase transition-colors hover:text-[var(--nx-ink)]"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden rounded-full px-3.5 py-2 text-[13px] font-medium text-[var(--nx-muted)] transition-colors hover:text-[var(--nx-ink)] sm:block"
          >
            Sign in
          </Link>
          <Link
            href="/workspace"
            className="group flex items-center gap-1.5 rounded-full bg-[var(--nx-signal)] px-4.5 py-2.5 text-[13px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85 active:scale-[0.97]"
          >
            Open app
            <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
