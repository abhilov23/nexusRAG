"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CornerDownLeft, Sparkles } from "lucide-react";

const QA = [
  {
    q: "Where is authentication implemented?",
    a: "Authentication lives in auth/session.ts (validateSession) and auth/jwt.ts (verifyAccessToken), fronted by AuthController. The middleware at middleware/auth.ts guards all /api/* routes.",
    files: ["auth/session.ts", "auth/jwt.ts", "middleware/auth.ts"],
  },
  {
    q: "Trace POST /api/login.",
    a: "AuthController.login → AuthService.authenticate → UserRepository.findByEmail → argon2 verify → Session.issue → Set-Cookie (httpOnly, SameSite=Lax). Failures return 401 JSON without leaking which half failed.",
    files: ["auth/controller.ts", "auth/service.ts", "auth/session.ts"],
  },
  {
    q: "What depends on UserService?",
    a: "Two direct dependents: AuthService (session validation) and BillingService (owner lookup). The graph shows depth-2 reach into 6 modules — change the interface and all six need a look.",
    files: ["auth/service.ts", "billing/service.ts"],
  },
  {
    q: "Where would I add OAuth?",
    a: "Add a provider strategy beside verifyAccessToken in auth/jwt.ts, a callback route next to AuthController.login, and extend the Session type — the graph confirms only 3 files touch session issuance.",
    files: ["auth/jwt.ts", "auth/controller.ts", "auth/types.ts"],
  },
  {
    q: "Explain the payment pipeline.",
    a: "BillingController.charge → BillingService.authorize → Stripe adapter → Ledger.append → webhook reconcile. Every hop is a code-aware chunk with call-graph edges, so the answer cites each file.",
    files: ["billing/controller.ts", "billing/service.ts", "ledger/append.ts"],
  },
  {
    q: "Most important modules?",
    a: "By PageRank over the dependency graph: auth/session, db/client, queue/worker, retrieval/fusion. These four carry 61% of inbound edges — start reading here.",
    files: ["auth/session.ts", "db/client.ts", "retrieval/fusion.ts"],
  },
];

function StreamedAnswer({ text, instant }: { text: string; instant: boolean }) {
  const [shown, setShown] = useState(() => (instant ? text : ""));

  useEffect(() => {
    if (instant) return;
    let i = 0;
    const timer = setInterval(() => {
      i += 3;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, 18);
    return () => clearInterval(timer);
  }, [text, instant]);

  return (
    <>
      {shown}
      <span
        aria-hidden="true"
        className="nx2-caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] bg-[var(--nx-ink)]"
      />
    </>
  );
}

export function Queries() {
  const [selected, setSelected] = useState(0);
  const reduce = useReducedMotion();

  const active = QA[selected] ?? QA[0]!;

  return (
    <section
      id="queries"
      className="relative scroll-mt-24 border-t border-[var(--nx-border)] py-24 sm:py-32"
    >
      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.21, 0.65, 0.25, 1] }}
          className="max-w-[720px]"
        >
          <p className="nx2-mono text-[11px] tracking-[0.22em] text-[var(--nx-ink)] uppercase">
            03 — Try it in your head
          </p>
          <h2 className="nx2-display mt-4 text-[clamp(2.2rem,5vw,3.9rem)] leading-[1.0] font-semibold text-balance text-[var(--nx-ink)]">
            Questions developers{" "}
            <span className="nx2-serif font-medium text-[var(--nx-muted)]">actually ask.</span>
          </h2>
          <p className="mt-4 max-w-[62ch] text-[14px] leading-relaxed text-[var(--nx-muted)]">
            Sample answers show the shape — file, lines, symbol.{" "}
            <span className="nx2-sample-tag align-middle">Samples</span> Connect a repository to ask
            live and get citations from your own code.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, ease: [0.21, 0.65, 0.25, 1] }}
            className="flex flex-wrap content-start gap-2.5"
            role="tablist"
            aria-label="Example questions"
          >
            {QA.map((item, i) => (
              <button
                key={item.q}
                role="tab"
                aria-selected={selected === i}
                onClick={() => setSelected(i)}
                className={`flex items-center gap-2 rounded-full border px-4.5 py-2.5 text-left text-[13.5px] transition-all ${
                  selected === i
                    ? "border-[var(--nx-ink)] bg-[var(--nx-ink)] font-semibold text-[var(--nx-bg)]"
                    : "border-[var(--nx-border)] bg-[var(--nx-surface)] text-[var(--nx-muted)] hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
                }`}
              >
                {item.q}
                {selected === i && <CornerDownLeft className="size-3.5" />}
              </button>
            ))}
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.21, 0.65, 0.25, 1] }}
            className="min-h-[300px] rounded-3xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-5 sm:p-7"
          >
            <div className="flex justify-end">
              <p
                key={`q-${selected}`}
                className="max-w-[88%] rounded-2xl rounded-br-md bg-[var(--nx-ink)] px-4 py-2.5 text-[13.5px] leading-relaxed font-medium text-[var(--nx-bg)]"
              >
                {active.q}
              </p>
            </div>
            <div className="mt-4 flex gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--nx-ink)] text-[var(--nx-bg)]">
                <Sparkles className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-[var(--nx-border)] bg-[var(--nx-raised)] px-4 py-3.5 sm:px-5">
                <p className="min-h-[96px] text-[15px] leading-relaxed text-[var(--nx-ink)]">
                  <StreamedAnswer key={selected} text={active.a} instant={!!reduce} />
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--nx-border)] pt-4">
                  {active.files.map((f) => (
                    <span key={f} className="nx2-chip">
                      ⎇ {f}
                    </span>
                  ))}
                  <Link
                    href={`/chat?q=${encodeURIComponent(active.q)}`}
                    className="group ml-auto inline-flex items-center gap-1.5 nx2-mono text-[11.5px] tracking-[0.08em] text-[var(--nx-ink)] uppercase"
                  >
                    Ask live
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
