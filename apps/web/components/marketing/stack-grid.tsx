"use client";

import { motion, useReducedMotion } from "framer-motion";

const ROWS = [
  { layer: "Interface", tech: "Next.js + chat UI", note: "Ask, browse sources, explore the graph" },
  { layer: "API", tech: "Next.js routes", note: "Auth, repos, ask, graph — hardened edge" },
  { layer: "AI service", tech: "FastAPI", note: "Parse, embed, retrieve, answer" },
  { layer: "Parsing", tech: "Tree-sitter", note: "Code-aware chunks + symbol graph" },
  { layer: "Vectors", tech: "Qdrant", note: "1536-d semantic search" },
  { layer: "Lexical", tech: "Elasticsearch", note: "Exact identifiers + code analyzer" },
  { layer: "Graph", tech: "Neo4j", note: "CALLS · USES · DEPENDS_ON" },
  { layer: "Jobs", tech: "BullMQ + Redis", note: "Ingestion & indexing queues" },
  { layer: "State", tech: "PostgreSQL + Prisma", note: "Repos, commits, sessions" },
  { layer: "Artifacts", tech: "S3 / MinIO / R2", note: "Versioned repo snapshots" },
];

export function StackGrid() {
  const reduce = useReducedMotion();
  return (
    <section
      id="stack"
      className="relative scroll-mt-24 border-t border-[var(--nx-border)] py-24 sm:py-32"
    >
      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.21, 0.65, 0.25, 1] }}
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <p className="nx2-mono text-[11px] tracking-[0.22em] text-[var(--nx-ink)] uppercase">
              04 — Under the hood
            </p>
            <h2 className="nx2-display mt-4 text-[clamp(2.2rem,5vw,3.9rem)] leading-[1.0] font-semibold text-balance text-[var(--nx-ink)]">
              Boring infrastructure,{" "}
              <span className="nx2-serif font-medium text-[var(--nx-muted)]">exotic results.</span>
            </h2>
          </div>
          <p className="max-w-[300px] text-[13.5px] leading-relaxed text-[var(--nx-muted)]">
            Every layer is a best-in-class open system. No black boxes, no lock-in.
          </p>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.21, 0.65, 0.25, 1] }}
          className="mt-12 overflow-hidden rounded-3xl border border-[var(--nx-border)] bg-[var(--nx-surface)]"
        >
          {ROWS.map((r, i) => (
            <div
              key={r.layer}
              className={`group grid cursor-default grid-cols-[110px_1fr] items-baseline gap-3 px-5 py-4 transition-colors sm:grid-cols-[180px_1fr_1fr] sm:gap-6 sm:px-7 ${
                i !== ROWS.length - 1 ? "border-b border-[var(--nx-border)]" : ""
              } hover:bg-[var(--nx-ink)]`}
            >
              <span className="nx2-mono text-[11px] tracking-[0.16em] text-[var(--nx-faint)] uppercase group-hover:text-[var(--nx-bg)] group-hover:opacity-70">
                {r.layer}
              </span>
              <span className="nx2-display text-[17px] font-semibold text-[var(--nx-ink)] group-hover:text-[var(--nx-bg)] sm:text-[19px]">
                {r.tech}
              </span>
              <span className="col-span-2 text-[13px] text-[var(--nx-muted)] group-hover:text-[var(--nx-bg)] group-hover:opacity-75 sm:col-span-1">
                {r.note}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
