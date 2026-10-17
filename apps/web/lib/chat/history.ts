"use client";

import { useEffect, useState } from "react";

export type StoredSource = {
  path: string;
  start_line: number;
  end_line: number;
  symbol: string | null;
};

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  sources?: StoredSource[];
  /** End-to-end round-trip of the answer, in ms. */
  latencyMs?: number;
};

/** Fires in the same tab whenever history is written. */
export const HISTORY_EVENT = "nexus:history-changed";

export type ChatThread = {
  repoId: string;
  /** First question — the chat's title. */
  title: string;
  /** Most recent question. */
  lastText: string;
  /** Total messages in the thread. */
  count: number;
  /** Last activity timestamp. */
  at: number;
};

const KEY = "nexus-chat-history";
const MAX_MESSAGES_PER_REPO = 40;
const MAX_REPOS = 12;

function isStoredMessage(value: unknown): value is StoredMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<StoredMessage>;
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.text === "string" &&
    typeof message.at === "number"
  );
}

/** Restore conversations from localStorage. Client-only by design. */
export function loadHistory(): Record<string, StoredMessage[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const clean: Record<string, StoredMessage[]> = {};
    for (const [repoId, thread] of Object.entries(parsed)) {
      if (!Array.isArray(thread)) continue;
      const messages = thread
        .filter(isStoredMessage)
        .filter((message) => message.role === "user" || message.text.trim().length > 0)
        .slice(-MAX_MESSAGES_PER_REPO);
      if (messages.length > 0) clean[repoId] = messages;
    }
    return clean;
  } catch {
    return {};
  }
}

/** Persist conversations. Keeps the most recently used repositories, capped. */
export function saveHistory(conversations: Record<string, StoredMessage[]>): void {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(conversations)
      .map(
        ([repoId, thread]) =>
          [
            repoId,
            thread
              .filter((message) => message.role === "user" || message.text.trim().length > 0)
              .map(({ id, role, text, at, sources, latencyMs }) => ({
                id,
                role,
                text,
                at,
                sources,
                latencyMs,
              }))
              .slice(-MAX_MESSAGES_PER_REPO),
          ] as const,
      )
      .filter(([, thread]) => thread.length > 0)
      .sort((a, b) => (b[1][b[1].length - 1]?.at ?? 0) - (a[1][a[1].length - 1]?.at ?? 0))
      .slice(0, MAX_REPOS);
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
    window.dispatchEvent(new Event(HISTORY_EVENT));
  } catch {
    /* storage full or blocked — history is a convenience, not data */
  }
}

/** One entry per chat thread — the complete conversation, not each question. */
export function listThreads(): ChatThread[] {
  const history = loadHistory();
  const threads: ChatThread[] = [];
  for (const [repoId, messages] of Object.entries(history)) {
    const firstQuestion = messages.find((message) => message.role === "user");
    if (!firstQuestion) continue;
    const lastQuestion = [...messages].reverse().find((message) => message.role === "user");
    threads.push({
      repoId,
      title: firstQuestion.text,
      lastText: lastQuestion?.text ?? firstQuestion.text,
      count: messages.length,
      at: messages[messages.length - 1]?.at ?? firstQuestion.at,
    });
  }
  return threads.sort((a, b) => b.at - a.at);
}

/** Complete chats, most recent first. Refreshes on writes and cross-tab edits. */
export function useChatThreads(): ChatThread[] {
  const [threads, setThreads] = useState<ChatThread[]>([]);

  useEffect(() => {
    const refresh = () => setThreads(listThreads());
    refresh();
    window.addEventListener(HISTORY_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(HISTORY_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return threads;
}
