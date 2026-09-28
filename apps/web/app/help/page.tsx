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

type HelpTopic =
  "Getting started" | "Repositories" | "Chat & answers" | "Account";
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
        `${article.question} ${article.answer} ${article.category}`
          .toLowerCase()
          .includes(search);
      return matchesTopic && matchesSearch;
    });
  }, [query, topic]);

  return (
    <div className="help-page">
      <header className="help-heading">
        <div className="help-heading-copy">
          <span className="help-eyebrow">NEXUSRAG GUIDE</span>
          <h1>
            Help center<span>.</span>
          </h1>
          <p>
            Find a clear answer, learn a workflow, and get back to your code.
          </p>
        </div>
        <div className="help-heading-art">
          <CircleHelp size={26} />
          <span>Here when you need it</span>
        </div>
      </header>

      <section className="help-search-panel">
        <div className="help-search-copy">
          <strong>What can we help you find?</strong>
          <span>Search setup, repository, chat, and account questions.</span>
        </div>
        <label className="help-search-input">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try 'repository indexing'"
            aria-label="Search help articles"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </label>
      </section>

      <div
        className="help-topic-tabs"
        role="group"
        aria-label="Filter help topics"
      >
        {topics.map((item) => (
          <button
            type="button"
            key={item}
            className={topic === item ? "active" : ""}
            onClick={() => setTopic(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="help-content-grid">
        <section className="help-articles">
          <div className="help-list-heading">
            <div>
              <span>ANSWERS & GUIDES</span>
              <h2>
                {topic === "All topics" ? "Frequently asked questions" : topic}
              </h2>
            </div>
            <span>{filteredArticles.length} articles</span>
          </div>
          {filteredArticles.length ? (
            <div className="help-accordion">
              {filteredArticles.map((article) => (
                <details key={article.question}>
                  <summary>
                    <span>{article.question}</span>
                    <ArrowRight size={15} />
                  </summary>
                  <div className="help-answer">
                    <span>{article.category}</span>
                    <p>{article.answer}</p>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="help-empty">
              <Search size={20} />
              <strong>No matching articles</strong>
              <p>Try a different phrase or choose another topic.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setTopic("All topics");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </section>

        <aside className="help-side-rail">
          <section className="help-side-card help-start-card">
            <span className="help-side-icon">
              <Sparkles size={16} />
            </span>
            <span className="help-card-kicker">NEW TO NEXUSRAG?</span>
            <h2>Start with a repository.</h2>
            <p>
              Connect a codebase, check its index status, then ask your first
              repository-specific question.
            </p>
            <Link href="/workspace">
              Open workspace <ArrowUpRight size={13} />
            </Link>
          </section>
          <section className="help-side-card">
            <span className="help-card-kicker">QUICK LINKS</span>
            <Link href="/workspace">
              <Boxes size={15} />
              Workspace
              <ArrowRight size={13} />
            </Link>
            <Link href="/chat">
              <GitBranch size={15} />
              Chat playground
              <ArrowRight size={13} />
            </Link>
            <Link href="/evaluations">
              <FileCode2 size={15} />
              Evaluations
              <ArrowRight size={13} />
            </Link>
          </section>
          <section className="help-privacy-note">
            <ShieldCheck size={15} />
            <div>
              <strong>Keep the source in view</strong>
              <p>
                Use citations and retrieval traces to verify important answers
                against your repository.
              </p>
            </div>
          </section>
        </aside>
      </div>

      <footer className="help-footer">
        <span>
          <BookOpen size={14} /> Still exploring? Start with the basics.
        </span>
        <Link href="/workspace">
          Go to your workspace <ArrowRight size={13} />
        </Link>
      </footer>
    </div>
  );
}