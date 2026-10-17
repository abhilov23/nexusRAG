"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, GitFork } from "lucide-react";

type Node = { id: string; x: number; y: number; label: string; sub: string };
type Edge = { from: string; to: string; label: string };

const NODES: Node[] = [
  { id: "controller", x: 110, y: 60, label: "AuthController", sub: "POST /api/login" },
  { id: "service", x: 320, y: 60, label: "AuthService", sub: "validateSession()" },
  { id: "repo", x: 320, y: 220, label: "UserRepository", sub: "findByEmail()" },
  { id: "db", x: 110, y: 220, label: "PostgreSQL", sub: "users table" },
];

const EDGES: Edge[] = [
  { from: "controller", to: "service", label: "CALLS" },
  { from: "service", to: "repo", label: "USES" },
  { from: "repo", to: "db", label: "QUERIES" },
];

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

function edgePath(a: Node, b: Node) {
  const mx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
}

const CODE = `async function validateSession(token: string) {
  const claims = await verifyAccessToken(token);
  // JWKS cache hit → no network round-trip
  const user = await UserRepository.findById(
    claims.sub,
  );
  if (!user || user.revokedAt) throw new AuthError();
  return Session.from(user);
}`;

export function GraphShowcase() {
  const [active, setActive] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const activeNode = active ? (byId[active] ?? null) : null;

  const isLit = (id: string) =>
    active === null ||
    active === id ||
    EDGES.some((e) => (e.from === active && e.to === id) || (e.to === active && e.from === id));

  return (
    <section
      id="graph"
      className="relative scroll-mt-24 border-t border-[var(--nx-border)] py-24 sm:py-32"
    >
      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.21, 0.65, 0.25, 1] }}
          className="max-w-[760px]"
        >
          <p className="nx2-mono text-[11px] tracking-[0.22em] text-[var(--nx-ink)] uppercase">
            02 — The code graph
          </p>
          <h2 className="nx2-display mt-4 text-[clamp(2.2rem,5vw,3.9rem)] leading-[1.0] font-semibold text-balance text-[var(--nx-ink)]">
            Similarity finds text.{" "}
            <span className="nx2-serif font-medium text-[var(--nx-muted)]">
              The graph finds truth.
            </span>
          </h2>
          <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-[var(--nx-muted)]">
            Hover or focus a node. “What depends on AuthService?” and “trace the login flow” stop
            being searches — they become traversals over relationships extracted at parse time.{" "}
            <span className="nx2-sample-tag ml-1 align-middle">Sample traversal</span>
          </p>
        </motion.div>

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          {/* Graph panel */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, ease: [0.21, 0.65, 0.25, 1] }}
            className="relative overflow-hidden rounded-3xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-6 sm:p-8"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 nx2-mono text-[11px] tracking-[0.18em] text-[var(--nx-faint)] uppercase">
                <GitFork className="size-4 text-[var(--nx-ink)]" /> dependency traversal
              </span>
              <span className="nx2-mono text-[11px] text-[var(--nx-faint)]">depth · 2</span>
            </div>
            <svg
              viewBox="0 0 430 280"
              className="mt-4 h-auto w-full"
              role="img"
              aria-label="Auth dependency graph"
              onMouseLeave={() => setActive(null)}
            >
              {EDGES.map((e) => {
                const a = byId[e.from];
                const b = byId[e.to];
                if (!a || !b) return null;
                const lit = active === null || active === e.from || active === e.to;
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                return (
                  <g key={`${e.from}-${e.to}`} opacity={lit ? 1 : 0.18}>
                    <path
                      d={edgePath(a, b)}
                      fill="none"
                      stroke="var(--nx-border-strong)"
                      strokeWidth="1.5"
                    />
                    <path
                      d={edgePath(a, b)}
                      fill="none"
                      stroke="var(--nx-ink)"
                      strokeWidth="1.5"
                      className="nx2-flow"
                    />
                    <text
                      x={mx}
                      y={my - 8}
                      textAnchor="middle"
                      fill="var(--nx-ink)"
                      fontSize="10"
                      fontFamily="'DM Mono', monospace"
                      letterSpacing="2"
                    >
                      {e.label}
                    </text>
                  </g>
                );
              })}
              {NODES.map((n) => {
                const lit = isLit(n.id);
                return (
                  <g
                    key={n.id}
                    opacity={lit ? 1 : 0.3}
                    onMouseEnter={() => setActive(n.id)}
                    className="cursor-pointer"
                  >
                    {active === n.id && (
                      <circle cx={n.x} cy={n.y} r="10" fill="var(--nx-ink)" className="nx2-ping" />
                    )}
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r="7"
                      fill={active === n.id ? "var(--nx-ink)" : "var(--nx-surface)"}
                      stroke="var(--nx-ink)"
                      strokeWidth="2"
                    />
                    <text
                      x={n.x}
                      y={n.y - 20}
                      textAnchor="middle"
                      fill="var(--nx-ink)"
                      fontSize="13"
                      fontWeight="600"
                      fontFamily="'Space Grotesk', sans-serif"
                    >
                      {n.label}
                    </text>
                    <text
                      x={n.x}
                      y={n.y + 26}
                      textAnchor="middle"
                      fill="var(--nx-faint)"
                      fontSize="10.5"
                      fontFamily="'DM Mono', monospace"
                    >
                      {n.sub}
                    </text>
                  </g>
                );
              })}
            </svg>
            <p className="mt-2 nx2-mono text-[11px] text-[var(--nx-faint)]">
              {activeNode
                ? `● ${activeNode.label} — ${EDGES.filter((e) => e.from === activeNode.id || e.to === activeNode.id).length} direct relations highlighted`
                : "○ hover or tab to a node to isolate its relations"}
            </p>
            <div
              className="mt-3 flex flex-wrap gap-1.5"
              role="group"
              aria-label="Focus a graph node"
            >
              {NODES.map((n) => (
                <button
                  key={n.id}
                  onMouseEnter={() => setActive(n.id)}
                  onFocus={() => setActive(n.id)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive((cur) => (cur === n.id ? null : n.id))}
                  aria-pressed={active === n.id}
                  className={`rounded-full border px-3 py-1.5 nx2-mono text-[11px] transition-colors ${
                    active === n.id
                      ? "border-[var(--nx-ink)] bg-[var(--nx-ink)] font-semibold text-[var(--nx-bg)]"
                      : "border-[var(--nx-border)] text-[var(--nx-muted)] hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Code panel */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.21, 0.65, 0.25, 1] }}
            className="flex flex-col overflow-hidden rounded-3xl border border-[var(--nx-border)] bg-[var(--nx-surface)]"
          >
            <div className="flex items-center gap-2 border-b border-[var(--nx-border)] px-5 py-3.5">
              <span className="size-2.5 rounded-full bg-[var(--nx-ink)]" />
              <span className="size-2.5 rounded-full bg-[var(--nx-faint)] opacity-60" />
              <span className="size-2.5 rounded-full bg-[var(--nx-faint)] opacity-30" />
              <span className="ml-3 nx2-mono text-[11.5px] text-[var(--nx-faint)]">
                auth/session.ts — sample chunk
              </span>
            </div>
            <pre className="flex-1 overflow-x-auto p-5 nx2-mono text-[12.5px] leading-[1.75] text-[var(--nx-muted)] sm:p-6">
              <code>{CODE}</code>
            </pre>
            <div className="border-t border-[var(--nx-border)] p-5 sm:p-6">
              <p className="nx2-mono text-[10.5px] tracking-[0.16em] text-[var(--nx-faint)] uppercase">
                Sample impact · “what breaks if this changes?”
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--nx-ink)]">
                3 callers · 1 interface · 2 tests —{" "}
                <span className="text-[var(--nx-ink)]">
                  AuthController, refresh-token flow, session tests
                </span>
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <Link
                  href="/graph"
                  className="group inline-flex items-center gap-1.5 rounded-full bg-[var(--nx-signal)] px-4 py-2 text-[12.5px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85"
                >
                  Open live graph
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/chat?q=What%20depends%20on%20AuthService%3F"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--nx-border)] px-4 py-2 text-[12.5px] text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
                >
                  Ask about dependents
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
