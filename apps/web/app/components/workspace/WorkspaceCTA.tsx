"use client";

import { motion } from "framer-motion";
import { FolderPlus, ArrowUpRight } from "lucide-react";

interface WorkspaceCTAProps {
  onActionClick: () => void;
}

export function WorkspaceCTA({ onActionClick }: WorkspaceCTAProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.21, 0.65, 0.25, 1] }}
      aria-labelledby="cta-title"
      className="relative overflow-hidden rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-6 sm:p-8"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.09) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(70% 100% at 15% 0%, black, transparent)",
          WebkitMaskImage: "radial-gradient(70% 100% at 15% 0%, black, transparent)",
        }}
      />
      <div className="relative flex flex-wrap items-center gap-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--nx-signal)] text-[var(--nx-signal-ink)]">
          <FolderPlus size={19} />
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
            Empty workspace
          </p>
          <h2
            id="cta-title"
            className="font-display mt-1 text-[20px] font-semibold tracking-tight text-[var(--nx-ink)]"
          >
            Index your first codebase.
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--nx-muted)]">
            Paste a public GitHub URL — archive, parse, and hybrid-index run in the background.
          </p>
        </div>
        <button
          onClick={onActionClick}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[var(--nx-signal)] px-4 text-[13px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85 active:scale-[0.98]"
        >
          Connect a repo <ArrowUpRight size={14} />
        </button>
      </div>
    </motion.section>
  );
}
