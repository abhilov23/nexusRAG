"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Blocks, MessagesSquare, ScanSearch, Workflow } from "lucide-react";

const EASE = [0.21, 0.65, 0.25, 1] as const;

type Step = {
  n: string;
  title: string;
  serif: string;
  body: string;
  meta: string;
  icon: React.ReactNode;
  media: React.ReactNode;
};

function ChunkConsole() {
  const rows = [
    { kind: "class", name: "AuthController", meta: "3 methods" },
    { kind: "fn", name: "validateSession()", meta: "auth/session.ts" },
    { kind: "fn", name: "verifyAccessToken()", meta: "auth/jwt.ts" },
    { kind: "import", name: "AuthService → UserRepository", meta: "DEPENDS_ON" },
  ];
  return (
    <div className="space-y-2 rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-3">
      <p className="flex items-center justify-between px-1 pt-1 nx2-mono text-[10px] tracking-[0.18em] text-[var(--nx-faint)] uppercase">
        <span>Sample chunks · Tree-sitter boundaries</span>
        <span className="nx2-sample-tag">Sample</span>
      </p>
      {rows.map((s) => (
        <div
          key={s.name}
          className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-[var(--nx-raised)]"
        >
          <span className="rounded border border-[var(--nx-border)] bg-[var(--nx-raised)] px-1.5 py-0.5 nx2-mono text-[10px] text-[var(--nx-ink)]">
            {s.kind}
          </span>
          <span className="min-w-0 flex-1 truncate nx2-mono text-[12px] text-[var(--nx-ink)]">
            {s.name}
          </span>
          <span className="hidden nx2-mono text-[10.5px] text-[var(--nx-faint)] sm:block">
            {s.meta}
          </span>
        </div>
      ))}
    </div>
  );
}

function RetrievalMedia() {
  return (
    <div className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-5">
      <div className="flex flex-wrap items-center gap-2">
        {["vector", "lexical", "graph"].map((t) => (
          <span
            key={t}
            className="rounded-full border border-[var(--nx-border-strong)] bg-[var(--nx-raised)] px-3.5 py-1.5 nx2-mono text-[11px] tracking-[0.14em] text-[var(--nx-ink)] uppercase"
          >
            {t}
          </span>
        ))}
        <span className="nx2-sample-tag ml-auto">Sample flow</span>
      </div>
      <div className="my-4 h-px bg-[var(--nx-border)]" />
      <p className="nx2-mono text-[11.5px] leading-relaxed text-[var(--nx-muted)]">
        RRF fusion (k=60) → symbol-aware dedup → rerank → smallest context that answers
      </p>
    </div>
  );
}

function AnswerMedia() {
  return (
    <div className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-5">
      <p className="flex items-center justify-between nx2-mono text-[10px] tracking-[0.18em] text-[var(--nx-faint)] uppercase">
        <span>Sample answer shape</span>
        <span className="nx2-sample-tag">Sample</span>
      </p>
      <blockquote className="mt-3 border-l-2 border-[var(--nx-ink)] pl-4 nx2-serif text-[19px] leading-snug text-[var(--nx-ink)]">
        “Trace the auth flow” returns the flow — with line-level provenance.
      </blockquote>
      <div className="mt-4 flex flex-wrap gap-2">
        {["auth/session.ts", "auth/jwt.ts"].map((f) => (
          <span key={f} className="nx2-chip">
            ⎇ {f}
          </span>
        ))}
      </div>
    </div>
  );
}

function IngestMedia() {
  const legs = [
    { k: "GITHUB", v: "public repo URL" },
    { k: "SNAPSHOT", v: "tree @ SHA" },
    { k: "STORAGE", v: "R2 / MinIO archive" },
  ];
  return (
    <div className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-3">
      <p className="flex items-center justify-between px-1 pt-1 nx2-mono text-[10px] tracking-[0.18em] text-[var(--nx-faint)] uppercase">
        <span>Snapshot pipeline</span>
        <span className="nx2-sample-tag">Sample</span>
      </p>
      <div className="mt-2 grid gap-px overflow-hidden rounded-xl border border-[var(--nx-border)] bg-[var(--nx-border)]">
        {legs.map((leg, i) => (
          <div key={leg.k} className="flex items-center gap-3 bg-[var(--nx-surface)] px-3.5 py-3">
            <span className="font-mono text-[10px] tabular-nums text-[var(--nx-faint)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="nx2-mono text-[11px] tracking-[0.12em] text-[var(--nx-ink)]">
              {leg.k}
            </span>
            <span className="ml-auto truncate font-mono text-[11px] text-[var(--nx-muted)]">
              {leg.v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const STEPS: Step[] = [
  {
    n: "01",
    title: "Ingest",
    serif: "only what changed.",
    body: "Paste a repo URL. NexusRAG clones it, snapshots the tree, and archives it to object storage — then watches the SHA so unchanged commits never re-index.",
    meta: "GitHub → BullMQ → R2 / MinIO",
    icon: <Workflow className="size-5 text-[var(--nx-faint)]" />,
    media: <IngestMedia />,
  },
  {
    n: "02",
    title: "Parse",
    serif: "along the syntax.",
    body: "Tree-sitter walks every file and extracts classes, functions, imports and exports into code-aware chunks. Never blind character windows.",
    meta: "CHUNK = path + symbol + lines + imports",
    icon: <Blocks className="size-5 text-[var(--nx-faint)]" />,
    media: <ChunkConsole />,
  },
  {
    n: "03",
    title: "Retrieve ×3",
    serif: "then fuse.",
    body: "One question fans out to vector search, Elasticsearch lexical search, and Neo4j graph traversal. Reciprocal-rank fusion merges the streams; reranking keeps only what earns its tokens.",
    meta: "Qdrant + Elasticsearch + Neo4j",
    icon: <ScanSearch className="size-5 text-[var(--nx-faint)]" />,
    media: <RetrievalMedia />,
  },
  {
    n: "04",
    title: "Answer grounded",
    serif: "with receipts.",
    body: "The model responds over retrieved code, repo metadata and dependency context. Every claim traceable to a file and symbol — no hallucinated APIs.",
    meta: "sources attached · [S1] file#L-L",
    icon: <MessagesSquare className="size-5 text-[var(--nx-faint)]" />,
    media: <AnswerMedia />,
  },
];

/**
 * A guided sequence, not a grid: four chapters that walk the visitor through
 * the pipeline in order, alternating sides like an editorial feature.
 */
export function Journey() {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Scroll-directed choreography: a hairline progress fill scrubbed to the
  // section, plus per-step activation as each chapter takes the stage.
  useEffect(() => {
    if (reduce) return;
    let ctx: { revert: () => void } | undefined;
    let cancelled = false;
    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled || !sectionRef.current) return;
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        if (barRef.current) {
          gsap.fromTo(
            barRef.current,
            { scaleX: 0 },
            {
              scaleX: 1,
              ease: "none",
              scrollTrigger: {
                trigger: sectionRef.current,
                start: "top 70%",
                end: "bottom 55%",
                scrub: 0.5,
              },
            },
          );
        }
        gsap.utils.toArray<HTMLElement>("[data-step]").forEach((el) => {
          ScrollTrigger.create({
            trigger: el,
            start: "top 65%",
            end: "bottom 35%",
            toggleClass: { targets: el, className: "is-live" },
          });
        });
      }, sectionRef);
    })();
    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [reduce]);

  return (
    <section
      ref={sectionRef}
      id="journey"
      className="relative scroll-mt-24 border-t border-[var(--nx-border)] py-24 sm:py-32"
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[var(--nx-border)]">
        <div ref={barRef} className="h-full origin-left bg-[var(--nx-ink)]" />
      </div>
      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: EASE }}
          className="max-w-[720px]"
        >
          <p className="nx2-mono text-[11px] tracking-[0.22em] text-[var(--nx-ink)] uppercase">
            How it works
          </p>
          <h2 className="nx2-display mt-4 text-[clamp(2.2rem,5vw,3.9rem)] leading-[1.0] font-semibold text-balance text-[var(--nx-ink)]">
            From question to{" "}
            <span className="nx2-serif font-medium text-[var(--nx-muted)]">grounded answer</span> in
            four moves.
          </h2>
        </motion.div>

        <div className="mt-16 space-y-20 sm:space-y-28">
          {STEPS.map((s, i) => {
            const flip = i % 2 === 1;
            return (
              <motion.div
                key={s.n}
                data-step
                initial={reduce ? false : { opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.75, ease: EASE }}
                className="jstep grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
              >
                <div className={flip ? "lg:order-2" : ""}>
                  <p className="jnum nx2-mono text-[13px] tracking-[0.24em]">{s.n}</p>
                  <h3 className="nx2-display mt-3 text-[clamp(1.9rem,3.6vw,2.9rem)] leading-[1.02] font-semibold text-[var(--nx-ink)]">
                    {s.title}{" "}
                    <span className="nx2-serif font-medium text-[var(--nx-muted)]">{s.serif}</span>
                  </h3>
                  <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-[var(--nx-muted)]">
                    {s.body}
                  </p>
                  <p className="mt-4 nx2-mono text-[11.5px] tracking-[0.08em] text-[var(--nx-faint)]">
                    {s.meta}
                  </p>
                </div>
                <div className={flip ? "lg:order-1" : ""}>
                  <div className="flex items-center gap-2.5">{s.icon}</div>
                  <div className="mt-4">{s.media}</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const SPECS = [
  { value: "TS", label: "Tree-sitter code-aware chunks", sub: "path + symbol + lines" },
  { value: "1536", label: "embedding dimensions", sub: "Qdrant cosine search" },
  { value: "RRF·60", label: "reciprocal-rank fusion", sub: "vector + lexical + graph" },
  { value: "[S1]", label: "citations on every answer", sub: "file + lines + symbol" },
];

/** Spec ledger — truthful capabilities, not sample measurements. */
export function ProofBand() {
  const reduce = useReducedMotion();
  return (
    <section
      aria-label="System specifications"
      className="relative border-y border-[var(--nx-border)]"
    >
      <motion.dl
        initial={reduce ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.7, ease: EASE }}
        className="mx-auto grid w-full max-w-[1240px] grid-cols-2 gap-px bg-[var(--nx-border)] px-0 lg:grid-cols-4"
      >
        {SPECS.map((s) => (
          <div key={s.label} className="nx2-ledger-row bg-[var(--nx-bg)] px-6 py-6 sm:px-8">
            <dd className="nx2-display text-[30px] leading-none font-semibold text-[var(--nx-ink)] sm:text-[36px]">
              {s.value}
            </dd>
            <dt className="mt-2 text-[12px] text-[var(--nx-ink)]">{s.label}</dt>
            <dd className="mt-1 nx2-mono text-[10.5px] tracking-[0.06em] text-[var(--nx-faint)]">
              {s.sub}
            </dd>
          </div>
        ))}
      </motion.dl>
    </section>
  );
}
