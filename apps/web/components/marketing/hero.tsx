"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight, RotateCcw } from "lucide-react";
import { NetworkField } from "@/components/marketing/network-field";
import { SplitReveal } from "@/components/ui/signature";

type ServiceState = { ok: boolean; ms: number };
type StatusPayload = {
  ok: boolean;
  time: string;
  services: { database: ServiceState; cache: ServiceState };
};

const SAMPLE_QUERY = "Where is authentication implemented?";
const PIPE_STEPS = ["DOC", "CHUNK", "EMB·1536", "VECTOR", "LEXICAL", "GRAPH", "RRF·60", "ANSWER"];

/**
 * Live retrieval console — the hero's product object.
 * Status numbers are measured right now from /api/status (8s timeout, retry).
 * The query shown is a labelled sample that deep-links to real chat.
 */
function RetrievalConsole() {
  const reduce = useReducedMotion();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hot, setHot] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    let first = true;
    const load = async () => {
      if (document.hidden) return;
      if (first) setChecking(true);
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        const res = await fetch("/api/status", { cache: "no-store", signal: controller.signal });
        window.clearTimeout(timeout);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const payload = (await res.json()) as StatusPayload;
        if (!alive) return;
        setStatus(payload);
        setUnreachable(false);
      } catch {
        if (!alive) return;
        setUnreachable(true);
      } finally {
        if (alive) {
          first = false;
          setChecking(false);
        }
      }
    };
    void load();
    timer = setInterval(() => void load(), 30_000);
    const onVis = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setHot((h) => (h + 1) % PIPE_STEPS.length), 900);
    return () => window.clearInterval(id);
  }, [reduce]);

  const pill = unreachable
    ? {
        label: "Unreachable",
        cls: "border-[var(--nx-bad)] text-[var(--nx-bad)]",
        dot: "bg-[var(--nx-bad)]",
      }
    : status
      ? {
          label: status.ok ? "Operational" : "Degraded",
          cls: "border-[var(--nx-border-strong)] text-[var(--nx-ink)]",
          dot: "bg-[var(--nx-ink)] nx2-ping",
        }
      : {
          label: "Checking",
          cls: "border-[var(--nx-border)] text-[var(--nx-faint)]",
          dot: "bg-[var(--nx-faint)]",
        };

  return (
    <div className="nx2-console overflow-hidden rounded-[20px]">
      <div className="nx2-console-row flex items-center justify-between px-4 py-2.5 sm:px-5">
        <span className="nx2-mono text-[9.5px] tracking-[0.2em] text-[var(--nx-faint)]">
          RETRIEVAL CONSOLE · <span>SAMPLE QUERY</span>
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] nx2-mono text-[9px] tracking-[0.14em] uppercase ${pill.cls}`}
          role="status"
        >
          <span className={`size-1.5 rounded-full ${pill.dot}`} />
          {pill.label}
        </span>
      </div>

      <div className="nx2-console-row px-4 py-4 sm:px-5">
        <p className="nx2-mono text-[10px] tracking-[0.18em] text-[var(--nx-faint)] uppercase">
          Query
        </p>
        <p className="mt-2 max-w-[46ch] rounded-2xl rounded-br-md bg-[var(--nx-ink)] px-4 py-2.5 text-[13.5px] leading-relaxed font-medium text-[var(--nx-bg)]">
          {SAMPLE_QUERY}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Pipeline stages">
          {PIPE_STEPS.map((s, i) => (
            <span
              key={s}
              className={`nx2-pipe-step ${!reduce && i === hot ? "is-hot" : ""} ${!reduce && i === (hot + 1) % PIPE_STEPS.length ? "is-cycling" : ""}`}
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="nx2-console-row grid gap-px bg-[var(--nx-border)] sm:grid-cols-3">
        {[
          { k: "VECTOR", v: "Qdrant · 1536-d", d: "meaning, not keywords" },
          { k: "LEXICAL", v: "Elasticsearch", d: "exact symbols + paths" },
          { k: "GRAPH", v: "Neo4j · CALLS", d: "who depends on whom" },
        ].map((r) => (
          <div key={r.k} className="bg-[var(--nx-surface)] px-4 py-3.5">
            <p className="nx2-mono text-[10px] tracking-[0.16em] text-[var(--nx-ink)] uppercase">
              {r.k}
            </p>
            <p className="mt-1 text-[12.5px] font-semibold text-[var(--nx-ink)]">{r.v}</p>
            <p className="mt-0.5 text-[11.5px] text-[var(--nx-muted)]">{r.d}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-px bg-[var(--nx-border)] sm:grid-cols-2">
        {[
          { label: "PostgreSQL", state: status?.services.database },
          { label: "Redis queue", state: status?.services.cache },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--nx-surface)] px-5 py-3.5">
            <p className="nx2-mono text-[10px] tracking-[0.16em] text-[var(--nx-faint)] uppercase">
              {s.label}
            </p>
            <p className="nx2-display mt-1 text-[22px] leading-none font-semibold tabular-nums text-[var(--nx-ink)]">
              {s.state ? (
                <>
                  {s.state.ms}
                  <span className="ml-1 text-[12px] font-medium text-[var(--nx-faint)]">ms</span>
                </>
              ) : (
                <span className="text-[var(--nx-faint)]">—</span>
              )}
            </p>
            <p className="mt-1 nx2-mono text-[10px] text-[var(--nx-muted)]">
              {unreachable ? (
                <span className="text-[var(--nx-bad)]">● unreachable</span>
              ) : s.state ? (
                s.state.ok ? (
                  "● healthy"
                ) : (
                  "● failing"
                )
              ) : checking ? (
                "○ probing"
              ) : (
                "○ idle"
              )}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--nx-border)] bg-[var(--nx-inset)] px-4 py-3 sm:px-5">
        <span className="nx2-mono text-[10.5px] text-[var(--nx-faint)]">
          {unreachable ? (
            <>
              status fetch failed ·{" "}
              <button
                onClick={() => {
                  setChecking(true);
                  setUnreachable(false);
                  setStatus(null);
                }}
                className="inline-flex items-center gap-1 text-[var(--nx-ink)] underline-offset-2 hover:underline"
              >
                <RotateCcw className="size-3" /> retry
              </button>
            </>
          ) : status ? (
            <>checked {new Date(status.time).toLocaleTimeString()} · RRF k=60 · reranked</>
          ) : (
            "probing backends…"
          )}
        </span>
        <Link
          href={`/chat?q=${encodeURIComponent(SAMPLE_QUERY)}`}
          className="group inline-flex items-center gap-1.5 rounded-full bg-[var(--nx-signal)] px-4 py-2 text-[12.5px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85"
        >
          Ask live{" "}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

/**
 * Dashboard-mirroring hero: hairline blueprint, one WebGL particle field
 * (capped DPR, sleeps offscreen, static when reduced-motion), oversized
 * index typography, and the live console as product proof.
 */
export function Hero() {
  const reduce = useReducedMotion();

  return (
    <article className="relative isolate w-full overflow-hidden bg-[var(--nx-bg)] text-[var(--nx-ink)]">
      <div aria-hidden="true" className="nx2-blueprint absolute inset-0 opacity-70" />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          maskImage: "radial-gradient(85% 75% at 50% 38%, black 30%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(85% 75% at 50% 38%, black 30%, transparent 78%)",
        }}
      >
        <NetworkField />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_42%,transparent_42%,var(--nx-bg)_100%)]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-4 hidden sm:block">
        <span className="nx2-cross absolute top-0 left-0" />
        <span className="nx2-cross absolute top-0 right-0 rotate-90" />
        <span className="nx2-cross absolute bottom-0 left-0 -rotate-90" />
        <span className="nx2-cross absolute right-0 bottom-0 rotate-180" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-[1240px] flex-col justify-end px-5 pt-28 pb-10 sm:px-8">
        <div className="flex items-start justify-between gap-6 nx2-mono text-[11px] tracking-[0.18em] text-[var(--nx-muted)] uppercase">
          <p>Repository intelligence</p>
          <p className="tabular-nums">Cited / 01</p>
        </div>

        <div className="mt-8 grid items-end gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="max-w-[640px]">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.21, 0.65, 0.25, 1] }}
              className="inline-flex items-center gap-2.5 rounded-full border border-[var(--nx-border)] bg-[var(--nx-surface)] py-1.5 pr-4 pl-1.5"
            >
              <span className="flex items-center gap-1.5 rounded-full bg-[var(--nx-signal)] px-2.5 py-1 nx2-mono text-[10px] font-medium tracking-[0.12em] text-[var(--nx-signal-ink)] uppercase">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-current" />
                </span>
                Live
              </span>
              <span className="nx2-mono text-[11px] tracking-[0.14em] text-[var(--nx-muted)] uppercase">
                DOC → CHUNK → EMB → ANSWER
              </span>
            </motion.div>

            <h1 className="nx2-display mt-6 block max-w-[18ch] text-[clamp(2.6rem,5.6vw,4.8rem)] leading-[0.98] font-semibold text-balance text-[var(--nx-ink)]">
              <SplitReveal
                as="span"
                text="Ask the codebase. Get receipts."
                highlightWords={["receipts."]}
                highlightClassName="nx2-serif font-medium"
                delay={0.15}
              />
            </h1>

            <motion.p
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.45, ease: [0.21, 0.65, 0.25, 1] }}
              className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-[var(--nx-muted)]"
            >
              NexusRAG parses your repos into code-aware chunks, searches vectors, text, and the
              dependency graph together — then answers with line-level citations you can verify.
            </motion.p>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6, ease: [0.21, 0.65, 0.25, 1] }}
              className="mt-6 flex flex-wrap items-center gap-3"
            >
              <Link
                href="/workspace"
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--nx-signal)] px-6 py-3 text-[14px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85 active:scale-[0.98]"
              >
                Index a repository
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <a
                href="#journey"
                className="group inline-flex items-center gap-2 rounded-full border border-[var(--nx-border)] bg-[var(--nx-surface)] px-6 py-3 text-[14px] font-medium text-[var(--nx-ink)] transition-colors hover:border-[var(--nx-border-strong)]"
              >
                See the pipeline
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </a>
            </motion.div>

            <motion.p
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.85 }}
              className="mt-5 nx2-mono text-[11px] tracking-[0.08em] text-[var(--nx-faint)]"
            >
              TREE-SITTER CHUNKS · 1536-D EMBEDDINGS · RRF FUSION · CITED ANSWERS
            </motion.p>
          </div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.45, ease: [0.21, 0.65, 0.25, 1] }}
            className="w-full max-w-[560px] lg:justify-self-end"
          >
            <RetrievalConsole />
          </motion.div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1 }}
          className="mt-10 flex items-center gap-3"
          aria-hidden="true"
        >
          <span className="nx2-mono text-[10px] tracking-[0.24em] text-[var(--nx-faint)] uppercase">
            Scroll
          </span>
          <span className="relative h-px w-16 overflow-hidden bg-[var(--nx-track)]">
            <motion.span
              className="absolute inset-y-0 left-0 w-1/2 bg-[var(--nx-ink)]"
              animate={reduce ? undefined : { x: ["-100%", "200%"] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
          </span>
          <span className="nx2-mono text-[10px] tracking-[0.18em] text-[var(--nx-faint)] uppercase">
            04 moves · 01 idea per screen
          </span>
        </motion.div>
      </div>
    </article>
  );
}
