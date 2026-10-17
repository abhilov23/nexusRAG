"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Bot,
  CircleHelp,
  GitBranch,
  GitGraph,
  LayoutDashboard,
  MessageSquareText,
  RefreshCw,
  Settings,
} from "lucide-react";
import { listRepositories, type Repository } from "@/lib/repositories/client";
import { useChatThreads } from "@/lib/chat/history";

export const PALETTE_EVENT = "nexus:open-palette";

type Item = {
  key: string;
  group: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
  run: () => void;
};

const PAGES: Array<{ label: string; href: string; icon: React.ReactNode }> = [
  { label: "Workspace", href: "/workspace", icon: <LayoutDashboard size={15} /> },
  { label: "Chat", href: "/chat", icon: <Bot size={15} /> },
  { label: "Graph", href: "/graph", icon: <GitGraph size={15} /> },
  { label: "Evaluations", href: "/evaluations", icon: <Activity size={15} /> },
  { label: "Sync", href: "/sync", icon: <RefreshCw size={15} /> },
  { label: "Settings", href: "/settings", icon: <Settings size={15} /> },
  { label: "Help", href: "/help", icon: <CircleHelp size={15} /> },
];

/**
 * Real command palette: filters your repositories, recent threads and app
 * pages as you type, then navigates. Opened with Cmd/Ctrl+K or the topbar
 * trigger.
 *
 * The panel body remounts on every open (keyed by session), so query,
 * selection and results always start fresh -- no reset effects needed.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);

  useEffect(() => {
    const reveal = () => {
      setSession((s) => s + 1);
      setOpen(true);
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        reveal();
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const onTrigger = () => reveal();
    window.addEventListener("keydown", onKey);
    window.addEventListener(PALETTE_EVENT, onTrigger);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PALETTE_EVENT, onTrigger);
    };
  }, []);

  if (!open) return null;
  return <PaletteBody key={session} onClose={() => setOpen(false)} />;
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<Repository[]>([]);
  const [active, setActive] = useState(0);
  const recents = useChatThreads();

  useEffect(() => {
    let alive = true;
    listRepositories()
      .then((rows) => {
        if (alive) setRepos(rows);
      })
      .catch(() => {
        if (alive) setRepos([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const items = useMemo<Item[]>(() => {
    const needle = query.trim().toLowerCase();
    const match = (text: string) => !needle || text.toLowerCase().includes(needle);
    const list: Item[] = [];
    for (const repo of repos) {
      const label = `${repo.owner} / ${repo.name}`;
      if (!match(label)) continue;
      list.push({
        key: `repo-${repo.id}`,
        group: "Repositories",
        label,
        sub: repo.status === "READY" ? "Ask in chat" : repo.status.toLowerCase(),
        icon: <GitBranch size={15} />,
        run: () => router.push(`/chat?repo=${encodeURIComponent(repo.id)}`),
      });
    }
    for (const thread of recents.slice(0, 5)) {
      const repo = repos.find((r) => r.id === thread.repoId);
      const repoLabel = repo ? `${repo.owner} / ${repo.name}` : "";
      if (!match(thread.title) && !match(thread.lastText)) continue;
      list.push({
        key: `chat-${thread.repoId}`,
        group: "Recent chats",
        label: thread.title,
        sub: `${repoLabel ? `${repoLabel} · ` : ""}${thread.count} message${thread.count === 1 ? "" : "s"}`,
        icon: <MessageSquareText size={15} />,
        run: () => router.push(`/chat?repo=${encodeURIComponent(thread.repoId)}`),
      });
    }
    for (const page of PAGES) {
      if (!match(page.label)) continue;
      list.push({
        key: `page-${page.href}`,
        group: "Go to",
        label: page.label,
        sub: page.href,
        icon: page.icon,
        run: () => router.push(page.href),
      });
    }
    return list.slice(0, 9);
  }, [query, repos, recents, router]);

  const choose = (item: Item) => {
    onClose();
    item.run();
  };

  let lastGroup = "";
  return (
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="mx-auto mt-[14vh] w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-[var(--nx-border-strong)] bg-[var(--nx-surface)] shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-2.5 border-b border-[var(--nx-border)] px-4">
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                const item = items[active];
                if (item) choose(item);
              }
            }}
            placeholder="Search repositories, threads, pages…"
            aria-label="Search"
            className="h-12 flex-1 bg-transparent text-[14px] text-[var(--nx-ink)] outline-none placeholder:text-[var(--nx-faint)]"
          />
          <kbd className="rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--nx-muted)]">
            esc
          </kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-[var(--nx-faint)]">
              {query ? `No matches for “${query}”.` : "Type to search."}
            </p>
          )}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.key}>
                {header && (
                  <p className="px-3 pt-2 pb-1 font-mono text-[9.5px] tracking-[0.18em] text-[var(--nx-faint)] uppercase">
                    {header}
                  </p>
                )}
                <button
                  onClick={() => choose(item)}
                  onMouseMove={() => setActive(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    i === active ? "bg-[var(--nx-raised)]" : ""
                  }`}
                >
                  <span
                    className={i === active ? "text-[var(--nx-ink)]" : "text-[var(--nx-faint)]"}
                  >
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--nx-ink)]">
                    {item.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] text-[var(--nx-faint)]">
                    {item.sub}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
