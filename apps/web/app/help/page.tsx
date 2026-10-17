"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  CircleHelp,
  FileCode2,
  GitBranch,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { AppLayout } from "@/app/components/AppLayout";
import { PageHeader } from "@/components/ui/sections";

type HelpTopic = "Getting started" | "Repositories" | "Chat & answers" | "Account";
type Article = { category: HelpTopic; question: string; answer: string };
const topics = [
  "All topics",
  "Getting started",
  "Repositories",
  "Chat & answers",
  "Account",
] as const;
const articles: Article[] = [
  {
    category: "Getting started",
    question: "How do I get started with NexusRAG?",
    answer:
      "Open your workspace, connect a repository, and let indexing prepare its files for search. Once indexing finishes, start a chat scoped to that repository.",
  },
  {
    category: "Repositories",
    question: "How do I connect a repository?",
    answer:
      "From Workspace, choose Add repository and provide the repository source. NexusRAG will add it to your workspace and begin building its searchable code context.",
  },
  {
    category: "Repositories",
    question: "What does repository indexing do?",
    answer:
      "Indexing reads supported source files, splits them into searchable code chunks, and records file references so answers can point back to their source.",
  },
  {
    category: "Repositories",
    question: "Why might indexing fail?",
    answer:
      "The source may be unavailable, access may have changed, or a sync may have encountered an issue. Check the repository status and try re-indexing after confirming access.",
  },
  {
    category: "Chat & answers",
    question: "How do I chat with one specific repository?",
    answer:
      "Open Chat playground and choose a repository from the selector at the top or in the composer. The conversation stays associated with that repository.",
  },
  {
    category: "Chat & answers",
    question: "Where do answer citations come from?",
    answer:
      "Citations refer to files retrieved from the selected repository. Open a citation to inspect the source path and compare the answer with the underlying code.",
  },
  {
    category: "Chat & answers",
    question: "What is the trace inspector?",
    answer:
      "The trace inspector summarizes query understanding, retrieval, reranking, and answer generation, helping you see how a response was formed.",
  },
  {
    category: "Account",
    question: "Can I change the appearance?",
    answer:
      "Yes. Use the theme button in the top bar or choose Light or Dark in Settings. Your theme preference is saved on this device.",
  },
  {
    category: "Account",
    question: "Where can I change workspace preferences?",
    answer:
      "Open Settings from the sidebar to update workspace details, indexing defaults, appearance, and notification preferences.",
  },
];

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<(typeof topics)[number]>("All topics");
  const filteredArticles = useMemo(() => {
    const search = query.trim().toLowerCase();
    return articles.filter((article) => {
      const matchesTopic = topic === "All topics" || article.category === topic;
      const matchesSearch =
        !search ||
        `${article.question} ${article.answer} ${article.category}`.toLowerCase().includes(search);
      return matchesTopic && matchesSearch;
    });
  }, [query, topic]);

  return (
    <AppLayout>
      <div className="w-full px-5 pt-8 pb-14 sm:px-8">
        <PageHeader
          eyebrow="NexusRAG guide"
          title="Help center."
          lede="Find a clear answer, learn a workflow, and get back to your code."
        />

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-2.5">
          <label
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl bg-[var(--nx-inset)] px-3 text-[var(--nx-muted)] sm:max-w-[320px]"
            htmlFor="help-search"
          >
            <Search size={15} className="shrink-0" />
            <input
              id="help-search"
              name="help-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try 'repository indexing'"
              aria-label="Search help articles"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--nx-ink)] outline-none placeholder:text-[var(--nx-faint)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="text-[var(--nx-faint)] hover:text-[var(--nx-ink)]"
              >
                <X size={14} />
              </button>
            )}
          </label>
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter help topics"
          >
            {topics.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setTopic(item)}
                aria-pressed={topic === item}
                className={`h-9 rounded-xl px-3 text-[12.5px] transition-colors ${
                  topic === item
                    ? "bg-[var(--nx-ink)] font-semibold text-[var(--nx-bg)]"
                    : "text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="overflow-hidden rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)]">
            <div className="flex items-center justify-between border-b border-[var(--nx-border)] px-5 py-3.5">
              <h2 className="text-[13.5px] font-semibold tracking-tight text-[var(--nx-ink)]">
                {topic === "All topics" ? "Frequently asked questions" : topic}
              </h2>
              <span className="font-mono text-[10.5px] tabular-nums text-[var(--nx-faint)]">
                {filteredArticles.length} article{filteredArticles.length === 1 ? "" : "s"}
              </span>
            </div>
            {filteredArticles.length ? (
              <div>
                {filteredArticles.map((article) => (
                  <details
                    key={article.question}
                    className="group border-b border-[var(--nx-border)] last:border-b-0"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-[13.5px] font-medium text-[var(--nx-ink)] transition-colors hover:bg-[var(--nx-raised)] [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1">{article.question}</span>
                      <ArrowRight
                        size={15}
                        className="shrink-0 text-[var(--nx-faint)] transition-transform group-open:rotate-90"
                      />
                    </summary>
                    <div className="px-5 pb-5">
                      <p className="mb-1.5 inline-block rounded-md border border-[var(--nx-border)] px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-[var(--nx-faint)] uppercase">
                        {article.category}
                      </p>
                      <p className="max-w-[62ch] text-[13px] leading-relaxed text-[var(--nx-muted)]">
                        {article.answer}
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="px-5 py-12 text-center">
                <Search size={20} className="mx-auto text-[var(--nx-faint)]" />
                <strong className="mt-3 block text-[14px] font-semibold text-[var(--nx-ink)]">
                  No matching articles
                </strong>
                <p className="mt-1 text-[12.5px] text-[var(--nx-muted)]">
                  Try a different phrase or choose another topic.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setTopic("All topics");
                  }}
                  className="mt-4 h-9 rounded-xl border border-[var(--nx-border)] px-4 text-[12.5px] text-[var(--nx-muted)] hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
                >
                  Clear filters
                </button>
              </div>
            )}
          </section>

          <aside className="grid gap-4 lg:sticky lg:top-[76px]">
            <section className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-5">
              <span className="grid size-9 place-items-center rounded-xl bg-[var(--nx-ink)] text-[var(--nx-bg)]">
                <Sparkles size={16} />
              </span>
              <p className="mt-3 font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
                New to NexusRAG?
              </p>
              <h2 className="font-display mt-1 text-[17px] font-semibold tracking-tight text-[var(--nx-ink)]">
                Start with a repository.
              </h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--nx-muted)]">
                Connect a codebase, check its index status, then ask your first repository-specific
                question.
              </p>
              <Link
                href="/workspace"
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--nx-signal)] px-4 text-[12.5px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85"
              >
                Open workspace <ArrowUpRight size={13} />
              </Link>
            </section>
            <section className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-2">
              <p className="px-3 pt-2 pb-1 font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
                Quick links
              </p>
              {[
                { href: "/workspace", icon: <Boxes size={15} />, label: "Workspace" },
                { href: "/chat", icon: <GitBranch size={15} />, label: "Chat playground" },
                { href: "/evaluations", icon: <FileCode2 size={15} />, label: "Evaluations" },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] text-[var(--nx-muted)] transition-colors hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
                >
                  {l.icon}
                  <span className="flex-1">{l.label}</span>
                  <ArrowRight
                    size={13}
                    className="text-[var(--nx-faint)] transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              ))}
            </section>
            <section className="flex gap-2.5 rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-4">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[var(--nx-muted)]" />
              <div>
                <strong className="block text-[12.5px] font-semibold text-[var(--nx-ink)]">
                  Keep the source in view
                </strong>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--nx-muted)]">
                  Use citations and retrieval traces to verify important answers against your
                  repository.
                </p>
              </div>
            </section>
          </aside>
        </div>

        <footer className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[10.5px] tracking-[0.08em] text-[var(--nx-faint)] uppercase">
          <BookOpen size={13} />
          <span>Still exploring? Start with the basics.</span>
          <Link
            href="/workspace"
            className="ml-auto inline-flex items-center gap-1 text-[var(--nx-ink)] hover:underline"
          >
            Go to your workspace <ArrowRight size={12} />
          </Link>
        </footer>
      </div>
    </AppLayout>
  );
}
