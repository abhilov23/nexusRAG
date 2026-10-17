"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  CircleHelp,
  GitGraph,
  LayoutDashboard,
  MessageSquareText,
  Plus,
  RefreshCw,
  Settings,
  X,
} from "lucide-react";
import { useChatThreads } from "@/lib/chat/history";
import { Logo, NavLink } from "./brand";
import { Avatar, Progress } from "@/components/ui/avatar";
import { useRepositoryStats } from "@/lib/repositories/stats";
import { initials } from "@/app/hooks/useCurrentUser";
import type { CurrentUser } from "@/app/hooks/useCurrentUser";

const NAV = [
  { label: "Workspace", href: "/workspace", icon: <LayoutDashboard size={17} /> },
  { label: "Chat", href: "/chat", icon: <Bot size={17} /> },
  { label: "Graph", href: "/graph", icon: <GitGraph size={17} /> },
  { label: "Evaluations", href: "/evaluations", icon: <Activity size={17} /> },
  { label: "Sync", href: "/sync", icon: <RefreshCw size={17} /> },
  { label: "Settings", href: "/settings", icon: <Settings size={17} /> },
  { label: "Help", href: "/help", icon: <CircleHelp size={17} /> },
];

function Recents({
  onNavigate,
  repoNames,
}: {
  onNavigate: () => void;
  repoNames: Record<string, string>;
}) {
  const threads = useChatThreads().slice(0, 5);
  if (threads.length === 0) return null;
  return (
    <div className="mt-7">
      <p className="mb-2 px-3 font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
        Recent chats
      </p>
      <div className="flex flex-col gap-0.5">
        {threads.map((thread) => {
          const repoName = repoNames[thread.repoId];
          return (
            <Link
              key={thread.repoId}
              href={`/chat?repo=${encodeURIComponent(thread.repoId)}`}
              onClick={onNavigate}
              title={`${repoName ? `${repoName} · ` : ""}${thread.count} message${thread.count === 1 ? "" : "s"} — last: ${thread.lastText}`}
              className="group flex w-full min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--nx-raised)]"
            >
              <MessageSquareText
                size={14}
                className="shrink-0 text-[var(--nx-faint)] transition-colors group-hover:text-[var(--nx-ink)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-[var(--nx-muted)] transition-colors group-hover:text-[var(--nx-ink)]">
                  {thread.title}
                </span>
                {repoName && (
                  <span className="block truncate font-mono text-[10px] text-[var(--nx-faint)]">
                    {repoName}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--nx-faint)]">
                {thread.count}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar({
  user,
  open,
  onClose,
}: {
  user: CurrentUser;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const stats = useRepositoryStats();
  const repoNames: Record<string, string> = {};
  for (const repo of stats.rows) {
    repoNames[repo.id] = `${repo.owner}/${repo.name}`;
  }
  const displayName = user?.name?.trim() || user?.email?.split("@")[0] || "Guest";
  const pct = stats.total === 0 ? 0 : Math.round((stats.ready / stats.total) * 100);

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[268px] flex-col border-r border-[var(--nx-border)] bg-[var(--nx-bg)] px-4 pb-4 pt-5 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Primary"
      >
        <div className="flex items-center justify-between px-1">
          <Logo />
          <button
            className="grid size-8 place-items-center rounded-lg text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)] lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <Link
          href="/workspace"
          onClick={onClose}
          className="mt-5 flex items-center gap-2.5 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-2.5 transition-colors hover:border-[var(--nx-border-strong)]"
        >
          <Avatar tone="mint">
            {(user?.workspaceName ?? displayName).slice(0, 2).toUpperCase()}
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold tracking-tight text-[var(--nx-ink)]">
              {user?.workspaceName ?? displayName}
            </span>
            <span className="block font-mono text-[10px] tracking-[0.08em] text-[var(--nx-faint)] uppercase">
              {stats.total} repos · {stats.ready} ready
            </span>
          </span>
        </Link>

        <Link
          href="/chat"
          onClick={onClose}
          className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[var(--nx-signal)] px-4 text-[13px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85 active:scale-[0.985]"
        >
          <Plus size={15} />
          New chat
        </Link>

        <p className="mb-2 mt-7 px-3 font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
          Navigate
        </p>
        <nav className="grid gap-0.5" aria-label="Main navigation">
          {NAV.map((item) => (
            <span key={item.href} onClick={onClose}>
              <NavLink
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
              />
            </span>
          ))}
        </nav>

        <Recents onNavigate={onClose} repoNames={repoNames} />

        <div className="mt-auto space-y-3 pt-6">
          <div className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-4">
            <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.14em] text-[var(--nx-muted)] uppercase">
              <span>Indexed</span>
              <span className="tabular-nums text-[var(--nx-ink)]">
                {stats.ready}/{stats.total} · {pct}%
              </span>
            </div>
            <div className="my-2.5">
              <Progress value={pct} />
            </div>
            <p className="text-[11.5px] leading-relaxed text-[var(--nx-muted)]">
              {stats.total === 0 ? (
                "Connect a repository to begin."
              ) : (
                <>
                  {stats.failed > 0 && (
                    <span className="text-[var(--nx-bad)]">{stats.failed} failed · </span>
                  )}
                  {stats.active > 0 ? (
                    <span className="text-[var(--nx-muted)]">{stats.active} indexing…</span>
                  ) : (
                    <span>Queue idle.</span>
                  )}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2.5 border-t border-[var(--nx-border)] px-2 pt-3.5">
            <Avatar tone="sand">{initials(user?.name, user?.email)}</Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-[var(--nx-ink)]">
                {displayName}
              </p>
              <p className="truncate text-[11px] text-[var(--nx-faint)]">{user?.email || " "}</p>
            </div>
          </div>
        </div>
      </aside>
      {open && (
        <button
          aria-hidden="true"
          tabIndex={-1}
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}
    </>
  );
}
