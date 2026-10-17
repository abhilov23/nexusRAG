"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCurrentUser, initials } from "@/app/hooks/useCurrentUser";
import { loadHistory, saveHistory } from "@/lib/chat/history";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  FileCode2,
  GitBranch,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { AppLayout } from "@/app/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/sections";
import { listRepositories, type RepositoryStatus } from "@/lib/repositories/client";
import { cn } from "@/lib/utils";

// Strip thinking/chain-of-thought tags from assistant messages so they
// aren't rendered to the user.
const THINK_BLOCK_RE = /<\|begin▁of▁sentence\|>[\s\S]*?<\|end▁of▁sentence\|>/g;
const XML_THINK_RE = /<\|begin▁of▁thinking\|>[\s\S]*?<\|end▁of▁thinking\|>/g;
const THINK_TAG_RE = /〈.*?〉/gs;

function stripThinking(text: string): string {
  return text
    .replace(THINK_BLOCK_RE, "")
    .replace(XML_THINK_RE, "")
    .replace(THINK_TAG_RE, "")
    .trim();
}

type MessageSource = {
  path: string;
  start_line: number;
  end_line: number;
  symbol: string | null;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  loading?: boolean;
  at: number;
  sources?: MessageSource[];
  latencyMs?: number;
};

function messageAge(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day ago`;
}

type Repository = {
  id: string;
  name: string;
  branch: string;
};

function UserInitials() {
  const { user } = useCurrentUser();
  return <>{initials(user?.name, user?.email)}</>;
}

export type RecentThread = {
  repoId: string;
  repoName: string;
  text: string;
  at: number;
  count: number;
};

const STARTERS = [
  "Where is authentication handled?",
  "Explain the indexing pipeline",
  "What are the key modules?",
  "Trace a request from API to database",
];

function ChatHome({
  repoName,
  recents,
  onAsk,
  onResume,
}: {
  repoName: string;
  recents: RecentThread[];
  onAsk: (question: string) => void;
  onResume: (repoId: string) => void;
}) {
  const { user } = useCurrentUser();
  const firstName = user?.name?.trim().split(/\s+/)[0] || user?.email?.split("@")[0] || "there";
  const hour = new Date().getHours();
  const salutation =
    hour < 5
      ? "Working late"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 pt-10 pb-6 text-center sm:pt-14">
      <span className="mx-auto grid size-11 place-items-center rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] text-[var(--nx-ink)]">
        <Sparkles size={19} />
      </span>
      <p className="mt-4 font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
        NexusRAG assistant
      </p>
      <h1 className="font-display mt-2 text-[clamp(24px,3.4vw,32px)] font-semibold tracking-tight text-balance text-[var(--nx-ink)]">
        {salutation}, {firstName}.
      </h1>
      <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-[var(--nx-muted)]">
        Asking <strong className="font-semibold text-[var(--nx-ink)]">{repoName}</strong> — answers
        stay grounded in its source, with citations you can verify.
      </p>
      <div
        className="mt-6 grid gap-2 text-left sm:grid-cols-2"
        role="group"
        aria-label="Example questions"
      >
        {STARTERS.map((question) => (
          <button
            key={question}
            onClick={() => onAsk(question)}
            className="group flex items-center gap-2.5 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3.5 py-3 text-left text-[12.5px] text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
          >
            <span
              aria-hidden="true"
              className="text-[var(--nx-faint)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            >
              ↗
            </span>
            {question}
          </button>
        ))}
      </div>
      {recents.length > 0 && (
        <div className="mt-8 text-left">
          <p className="font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
            Continue where you left off
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {recents.map((thread) => (
              <button
                key={`${thread.repoId}-${thread.at}`}
                onClick={() => onResume(thread.repoId)}
                className="rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-3.5 text-left transition-colors hover:border-[var(--nx-border-strong)]"
              >
                <strong className="block truncate text-[12px] font-semibold text-[var(--nx-ink)]">
                  {thread.repoName}
                </strong>
                <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--nx-muted)]">
                  {thread.text}
                </p>
                <small className="mt-1.5 block font-mono text-[10px] text-[var(--nx-faint)]">
                  {messageAge(thread.at)} · {thread.count} message{thread.count === 1 ? "" : "s"}
                </small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatClient() {
  const searchParams = useSearchParams();
  const requestedRepo = searchParams.get("repo");

  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repositoriesLoading, setRepositoriesLoading] = useState(true);
  const [repositoriesError, setRepositoriesError] = useState(false);

  const loadRepositories = async () => {
    setRepositoriesLoading(true);
    setRepositoriesError(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const rows = await listRepositories(controller.signal);
      setRepositories(
        rows
          .filter((row) => row.status === ("READY" satisfies RepositoryStatus))
          .map((row) => ({
            id: row.id,
            name: `${row.owner} / ${row.name}`,
            branch: row.defaultBranch ?? "default",
          })),
      );
    } catch {
      setRepositoriesError(true);
    } finally {
      window.clearTimeout(timeout);
      setRepositoriesLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRepositories();
  }, []);

  const foundRepo = repositories.find((repo) => repo.id === requestedRepo);
  const selectedRepo = foundRepo ?? repositories[0];
  const [conversations, setConversations] = useState<Record<string, Message[]>>({});
  /* eslint-disable react-hooks/set-state-in-effect -- localStorage is client-only; reading it in render would desynchronise hydration. */
  useEffect(() => {
    const stored = loadHistory();
    if (Object.keys(stored).length > 0) {
      setConversations(stored);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (Object.keys(conversations).length === 0) return;
    saveHistory(conversations);
  }, [conversations]);
  const messages = selectedRepo ? (conversations[selectedRepo.id] ?? []) : [];

  const recents = useMemo(
    () =>
      Object.entries(conversations)
        .flatMap(([repoId, thread]) => {
          const lastUser = [...thread].reverse().find((m) => m.role === "user");
          if (!lastUser) return [];
          const repo = repositories.find((r) => r.id === repoId);
          return [
            {
              repoId,
              repoName: repo?.name ?? repoId,
              text: lastUser.text,
              at: lastUser.at,
              count: thread.length,
            },
          ];
        })
        .sort((a, b) => b.at - a.at)
        .slice(0, 6),
    [conversations, repositories],
  );

  const [prompt, setPrompt] = useState(() => searchParams.get("q") ?? "");
  const [traceOpen, setTraceOpen] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect -- reading the viewport is a
     client-only, post-mount operation, so this cannot move into render. */
  useEffect(() => {
    setTraceOpen(window.matchMedia("(min-width: 1201px)").matches);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const [allChunksOpen, setAllChunksOpen] = useState(false);
  const [citationFile, setCitationFile] = useState("");
  const traceQuery =
    [...messages].reverse().find((message) => message.role === "user")?.text ??
    "Your next question will appear here.";

  // The trace describes the last completed answer, so it survives reloads:
  // sources and latency are persisted with the message itself.
  const lastAnswered = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && !message.loading && message.text.length > 0);
  const lastSources: MessageSource[] = lastAnswered?.sources ?? [];
  const lastLatencyMs = lastAnswered?.latencyMs ?? null;
  const [activeSource, setActiveSource] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
        event.preventDefault();
        setTraceOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setActiveSource(false);
        setTraceOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const send = async (override?: string) => {
    const text = (override ?? prompt).trim();
    if (!text || !selectedRepo) return;
    const repoId = selectedRepo.id;
    const now = Date.now();
    const responseId = `answer-${now}`;
    setConversations((current) => ({
      ...current,
      [repoId]: [
        ...(current[repoId] ?? []),
        { id: `${responseId}-question`, role: "user", text, at: now },
        { id: responseId, role: "assistant", text: "", loading: true, at: now },
      ],
    }));
    setPrompt("");
    const startedAt = performance.now();

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ question: text, repositoryIds: [repoId], limit: 10 }),
        signal: AbortSignal.timeout(65_000),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        answer?: string;
        grounded?: boolean;
        sources?: { path: string; start_line: number; end_line: number; symbol: string | null }[];
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message || "Could not get an answer.");
      }

      const answer = payload.answer ?? "No answer was returned.";
      const sources = payload.sources ?? [];
      const latencyMs = Math.round(performance.now() - startedAt);

      if (sources.length > 0) {
        setCitationFile(sources[0]!.path);
      }
      setTraceOpen(true);

      setConversations((current) => ({
        ...current,
        [repoId]: (current[repoId] ?? []).map((message) =>
          message.id === responseId
            ? { ...message, text: answer, loading: false, at: Date.now(), sources, latencyMs }
            : message,
        ),
      }));
    } catch (error) {
      const reason =
        error instanceof DOMException && error.name === "TimeoutError"
          ? "The answer took too long (65s timeout). Retry with a narrower question."
          : error instanceof DOMException && error.name === "AbortError"
            ? "The request was aborted. Retry when ready."
            : error instanceof Error
              ? error.message
              : "Something went wrong.";
      setConversations((current) => ({
        ...current,
        [repoId]: (current[repoId] ?? []).map((message) =>
          message.id === responseId
            ? { ...message, text: `I could not answer that. ${reason}`, loading: false }
            : message,
        ),
      }));
    }
  };

  const selectRepository = (repoId: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("repo", repoId);
    window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`);
    window.dispatchEvent(new Event("popstate"));
    setActiveSource(false);
  };

  const copyAnswer = async (text: string) => {
    try {
      await navigator.clipboard?.writeText(stripThinking(text));
    } catch {
      return;
    }
    setCopyDone(true);
    window.setTimeout(() => setCopyDone(false), 1400);
  };

  if (!selectedRepo) {
    return (
      <AppLayout>
        <div className="mx-auto w-full max-w-[640px] px-4 py-14">
          <EmptyState
            icon={<BookOpen size={22} />}
            title="Ask your codebase."
            body={
              repositoriesLoading
                ? "Loading your indexed repositories…"
                : repositoriesError
                  ? "Could not reach the API. Check your connection and retry — your repositories are safe."
                  : "You have no indexed repositories yet. Add one from the Sync page and its code will be searchable here."
            }
            action={
              repositoriesLoading ? undefined : repositoriesError ? (
                <Button onClick={() => void loadRepositories()}>Retry</Button>
              ) : (
                <Button href="/sync">Open Sync</Button>
              )
            }
          />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex h-[calc(100dvh-60px)] items-stretch overflow-hidden">
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-[52px] flex-wrap items-center gap-2 border-b border-[var(--nx-border)] px-4 py-2 sm:px-6">
            <div className="flex min-w-0 items-center gap-2 text-[12.5px] font-semibold text-[var(--nx-ink)]">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--nx-border)] bg-[var(--nx-surface)] font-mono text-[10px] text-[var(--nx-muted)]">
                {selectedRepo.name.slice(0, 2).toUpperCase()}
              </span>
              <Select
                id="chat-repo"
                name="chat-repo"
                ariaLabel="Chat with repository"
                value={selectedRepo.id}
                onChange={selectRepository}
                options={repositories.map((repo) => ({ value: repo.id, label: repo.name }))}
                variant="ghost"
                size="xs"
                className="max-w-[220px] sm:max-w-[340px]"
                triggerClassName="text-[12.5px] font-semibold"
              />
            </div>
            <span className="inline-flex items-center gap-1.5 border-l border-[var(--nx-border)] pl-2.5 font-mono text-[10.5px] text-[var(--nx-faint)]">
              <GitBranch size={11} />
              {selectedRepo.branch}
            </span>
            <button
              onClick={() => setTraceOpen((open) => !open)}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--nx-border)] px-2.5 text-[11.5px] text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
            >
              {traceOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              {traceOpen ? "Hide trace" : "Show trace"}
              <kbd className="hidden rounded border border-[var(--nx-border)] bg-[var(--nx-raised)] px-1 font-mono text-[9px] sm:block">
                ⌘I
              </kbd>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <ChatHome
                repoName={selectedRepo.name}
                recents={recents}
                onAsk={(question) => void send(question)}
                onResume={(repoId) => selectRepository(repoId)}
              />
            ) : (
              <div className="w-full space-y-6 px-4 py-8 sm:px-6">
                {messages.map((message) => (
                  <div key={message.id} className="flex gap-3">
                    <div
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full border text-[10px] font-bold",
                        message.role === "assistant"
                          ? "border-[var(--nx-border-strong)] bg-[var(--nx-signal)] text-[var(--nx-signal-ink)]"
                          : "border-[var(--nx-border)] bg-[var(--nx-surface)] text-[var(--nx-muted)]",
                      )}
                    >
                      {message.role === "assistant" ? <Sparkles size={14} /> : <UserInitials />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2">
                        <strong className="text-[12px] font-semibold text-[var(--nx-ink)]">
                          {message.role === "assistant" ? "NexusRAG" : "You"}
                        </strong>
                        <span className="font-mono text-[10px] text-[var(--nx-faint)]">
                          {messageAge(message.at)}
                        </span>
                      </p>
                      {message.loading && !message.text ? (
                        <div
                          className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3.5 py-3"
                          role="status"
                        >
                          <span className="flex gap-1" aria-hidden="true">
                            <i className="size-1.5 animate-bounce rounded-full bg-[var(--nx-muted)]" />
                            <i className="size-1.5 animate-bounce rounded-full bg-[var(--nx-muted)] [animation-delay:120ms]" />
                            <i className="size-1.5 animate-bounce rounded-full bg-[var(--nx-muted)] [animation-delay:240ms]" />
                          </span>
                          <span className="text-[12px] text-[var(--nx-muted)]">
                            Searching vectors, text, and graph…
                          </span>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "mt-1.5 rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed",
                            message.role === "user"
                              ? "w-fit max-w-full border border-[var(--nx-border)] bg-[var(--nx-surface)] text-[var(--nx-ink)]"
                              : "border border-transparent bg-transparent px-0 text-[var(--nx-ink)]",
                          )}
                        >
                          {message.role === "assistant" ? (
                            <Markdown>{stripThinking(message.text)}</Markdown>
                          ) : (
                            <p className="whitespace-pre-wrap">{message.text}</p>
                          )}
                          {message.role === "assistant" &&
                            message.sources &&
                            message.sources.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {message.sources.map((source, sourceIndex) => (
                                  <button
                                    key={`${source.path}-${source.start_line}-${sourceIndex}`}
                                    onClick={() => {
                                      setCitationFile(source.path);
                                      setActiveSource(true);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--nx-border)] bg-[var(--nx-surface)] px-2 py-1 font-mono text-[10.5px] text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
                                  >
                                    S{sourceIndex + 1} · {source.path.split("/").pop()}#L
                                    {source.start_line}–{source.end_line}{" "}
                                    <span aria-hidden="true">↗</span>
                                  </button>
                                ))}
                              </div>
                            )}
                        </div>
                      )}
                      {message.role === "assistant" && !message.loading && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <button
                            onClick={() => copyAnswer(message.text)}
                            className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] text-[var(--nx-faint)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
                          >
                            <Copy size={12} />
                            {copyDone ? "Copied" : "Copy"}
                          </button>
                          <button
                            onClick={() => setTraceOpen(true)}
                            className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] text-[var(--nx-faint)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
                          >
                            <Terminal size={12} />
                            Trace
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="border-t border-[var(--nx-border)] bg-[var(--nx-bg)] px-4 pt-3 pb-4 sm:px-6">
            <div className="w-full">
              <div className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] transition-colors focus-within:border-[var(--nx-border-strong)]">
                <textarea
                  id="chat-prompt"
                  name="chat-prompt"
                  aria-label="Ask about this repository"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Ask about architecture, call graphs, or symbols…"
                  rows={2}
                  className="max-h-40 w-full resize-y bg-transparent px-4 pt-3 text-[13.5px] text-[var(--nx-ink)] outline-none placeholder:text-[var(--nx-faint)]"
                />
                <div className="flex items-center gap-2 px-3 pb-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--nx-border)] px-2.5 py-1 font-mono text-[10px] tracking-[0.06em] text-[var(--nx-muted)] uppercase">
                    <Check size={11} />
                    Hybrid retrieval
                  </span>
                  <span className="ml-auto hidden font-mono text-[10px] text-[var(--nx-faint)] sm:block">
                    <kbd className="rounded border border-[var(--nx-border)] bg-[var(--nx-raised)] px-1">
                      ↵
                    </kbd>{" "}
                    send ·{" "}
                    <kbd className="rounded border border-[var(--nx-border)] bg-[var(--nx-raised)] px-1">
                      ⇧↵
                    </kbd>{" "}
                    newline
                  </span>
                  <button
                    onClick={() => void send()}
                    disabled={!prompt.trim()}
                    aria-label="Send message"
                    className="grid size-9 place-items-center rounded-xl bg-[var(--nx-signal)] text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85 disabled:opacity-30"
                  >
                    <ArrowUp size={16} />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-center text-[11px] text-[var(--nx-faint)]">
                NexusRAG can make mistakes. Verify important answers against the source.
              </p>
            </div>
          </div>
        </section>

        {traceOpen && (
          <>
            <button
              aria-hidden="true"
              tabIndex={-1}
              onClick={() => setTraceOpen(false)}
              className="fixed inset-0 z-30 bg-black/50 xl:hidden"
            />
            <aside className="fixed inset-y-0 right-0 z-40 flex w-[min(340px,92vw)] flex-col border-l border-[var(--nx-border)] bg-[var(--nx-bg)] xl:static xl:z-auto xl:w-[320px] xl:shrink-0">
              <div className="flex h-[52px] items-center justify-between border-b border-[var(--nx-border)] px-4">
                <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--nx-ink)]">
                  <span className="size-1.5 animate-pulse rounded-full bg-[var(--nx-ink)]" />
                  Trace inspector
                </p>
                <button
                  onClick={() => setTraceOpen(false)}
                  aria-label="Close trace inspector"
                  className="grid size-8 place-items-center rounded-lg text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
                >
                  <PanelRightClose size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-3.5">
                  <p className="font-mono text-[9.5px] tracking-[0.18em] text-[var(--nx-faint)] uppercase">
                    Query
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--nx-ink)]">
                    {traceQuery}
                  </p>
                  <p className="mt-1.5 font-mono text-[10.5px] text-[var(--nx-faint)]">
                    {selectedRepo.name} · {selectedRepo.branch}
                  </p>
                </div>

                <div className="mt-4">
                  <div className="flex gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--nx-border)] bg-[var(--nx-surface)] text-[var(--nx-muted)]">
                      <Search size={13} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline justify-between gap-2">
                        <strong className="text-[12px] font-semibold text-[var(--nx-ink)]">
                          Retrieval
                        </strong>
                        <span className="font-mono text-[10px] tabular-nums text-[var(--nx-faint)]">
                          {lastLatencyMs !== null
                            ? `${(lastLatencyMs / 1000).toFixed(1)}s round-trip`
                            : "—"}
                        </span>
                      </p>
                      {lastSources.length > 0 ? (
                        <>
                          <p className="mt-1 text-[11.5px] text-[var(--nx-muted)]">
                            {lastSources.length} cited source{lastSources.length === 1 ? "" : "s"}
                          </p>
                          <div className="mt-2 grid gap-1.5">
                            {lastSources
                              .slice(0, allChunksOpen ? undefined : 2)
                              .map((source, rank) => (
                                <div
                                  key={`${source.path}-${source.start_line}-${rank}`}
                                  className="flex items-center gap-2.5 rounded-lg border border-[var(--nx-border)] bg-[var(--nx-surface)] px-2.5 py-2"
                                >
                                  <span className="font-mono text-[10px] tabular-nums text-[var(--nx-faint)]">
                                    {rank + 1}
                                  </span>
                                  <div className="min-w-0">
                                    <strong className="block truncate text-[11.5px] font-medium text-[var(--nx-ink)]">
                                      {source.path.split("/").pop() || source.path}
                                    </strong>
                                    <small className="block truncate font-mono text-[10px] text-[var(--nx-faint)]">
                                      {source.symbol ? `${source.symbol} · ` : ""}L
                                      {source.start_line}–{source.end_line}
                                    </small>
                                  </div>
                                </div>
                              ))}
                          </div>
                          {lastSources.length > 2 && (
                            <button
                              onClick={() => setAllChunksOpen((open) => !open)}
                              className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-[var(--nx-muted)] hover:text-[var(--nx-ink)]"
                            >
                              {allChunksOpen
                                ? "Show fewer chunks"
                                : `View all ${lastSources.length} chunks`}
                              <ArrowDown size={12} />
                            </button>
                          )}
                        </>
                      ) : (
                        <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--nx-faint)]">
                          No sources yet — ask a question and the cited files will appear here.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--nx-border)] bg-[var(--nx-surface)] text-[var(--nx-muted)]">
                      <Terminal size={13} />
                    </span>
                    <div>
                      <p className="flex items-baseline justify-between gap-2">
                        <strong className="text-[12px] font-semibold text-[var(--nx-ink)]">
                          Answer generation
                        </strong>
                      </p>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--nx-faint)]">
                        Model configured server-side. Per-step timings and token counts are not
                        reported by the API.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--nx-border)] px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--nx-muted)]">
                  <Check size={13} />
                  Trace complete
                </span>
              </div>
            </aside>
          </>
        )}
      </div>

      {activeSource && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActiveSource(false);
          }}
        >
          <section
            className="w-full max-w-[480px] overflow-hidden rounded-2xl border border-[var(--nx-border-strong)] bg-[var(--nx-surface)]"
            role="dialog"
            aria-modal="true"
            aria-label="Source code citation"
          >
            <header className="flex items-center gap-2.5 border-b border-[var(--nx-border)] px-4 py-3">
              <FileCode2 size={15} className="shrink-0 text-[var(--nx-muted)]" />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[13px] text-[var(--nx-ink)]">
                  {citationFile.split("/").pop() || citationFile}
                </strong>
                <small className="block truncate font-mono text-[10.5px] text-[var(--nx-faint)]">
                  {selectedRepo.name} / {citationFile}
                </small>
              </span>
              <button
                onClick={() => setActiveSource(false)}
                aria-label="Close source preview"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
              >
                <X size={15} />
              </button>
            </header>
            {(() => {
              const cited =
                lastSources.find((source) => source.path === citationFile) ?? lastSources[0];
              if (!cited) {
                return (
                  <p className="px-4 py-6 text-center text-[12.5px] text-[var(--nx-muted)]">
                    No cited source yet — ask a question first.
                  </p>
                );
              }
              return (
                <div className="px-4 py-4">
                  <p className="font-mono text-[12px] text-[var(--nx-ink)]">
                    {cited.symbol ?? cited.path.split("/").pop()}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-[var(--nx-faint)]">
                    {cited.path} · lines {cited.start_line}–{cited.end_line}
                  </p>
                </div>
              );
            })()}
            <footer className="flex items-center justify-between border-t border-[var(--nx-border)] px-4 py-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--nx-muted)]">
                <Check size={12} /> Cited from the last answer
              </span>
              <button
                onClick={() => setActiveSource(false)}
                className="h-8 rounded-lg border border-[var(--nx-border)] px-3 text-[12px] text-[var(--nx-muted)] hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
              >
                Close
              </button>
            </footer>
          </section>
        </div>
      )}
    </AppLayout>
  );
}
