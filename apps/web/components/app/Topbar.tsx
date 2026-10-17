"use client";

import { useRouter } from "next/navigation";
import { LogOut, Menu, Settings, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/primitives";
import { PALETTE_EVENT } from "@/components/app/CommandPalette";
import { ThemeToggle } from "@/app/components/workspace/ThemeToggle";
import { initials, type CurrentUser } from "@/app/hooks/useCurrentUser";

const TITLES: Record<string, string> = {
  "/workspace": "Repository Workspace",
  "/chat": "Repository Chat",
  "/graph": "Code Graph",
  "/evaluations": "Evaluations",
  "/settings": "Settings",
  "/code-graph": "Code Graph",
  "/sync": "Sync",
  "/help": "Help",
};

export function Topbar({
  user,
  pathname,
  onMenu,
}: {
  user: CurrentUser;
  pathname: string;
  onMenu: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [status, setStatus] = useState<{
    ok: boolean;
    time: string;
    services: { database: { ok: boolean; ms: number }; cache: { ok: boolean; ms: number } };
  } | null>(null);
  const displayName = user?.name?.trim() || user?.email?.split("@")[0] || "Guest";
  // Live status, fetched on demand. A failed probe surfaces a retry rather
  // than spinning forever.
  const loadStatus = () => {
    setStatusError(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    fetch("/api/status", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setStatus(data);
        else setStatusError(true);
      })
      .catch(() => setStatusError(true))
      .finally(() => window.clearTimeout(timeout));
  };
  useEffect(() => {
    if (!statusOpen) return;
    let alive = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    fetch("/api/status", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && data) setStatus(data);
        else if (alive && !data) setStatusError(true);
      })
      .catch(() => {
        if (alive) setStatusError(true);
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      alive = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [statusOpen]);
  const avatarText = initials(user?.name, user?.email);

  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between gap-3 border-b border-[var(--nx-border)] bg-[var(--nx-bg)] px-4 sm:px-7">
      <div className="flex min-w-0 items-center gap-2">
        <button
          className="grid size-9 place-items-center rounded-xl text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)] lg:hidden"
          onClick={onMenu}
          aria-label="Open menu"
        >
          <Menu size={19} />
        </button>
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-2 font-mono text-[11px] tracking-[0.08em] uppercase"
        >
          <span className="hidden text-[var(--nx-faint)] sm:inline">NexusRAG</span>
          <span aria-hidden="true" className="hidden text-[var(--nx-border-strong)] sm:inline">
            /
          </span>
          <strong className="truncate font-semibold tracking-tight normal-case text-[var(--nx-ink)] text-[13px]">
            {TITLES[pathname] || "NexusRAG"}
          </strong>
        </nav>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="relative hidden md:block">
          <button
            onClick={() => setStatusOpen((v) => !v)}
            aria-expanded={statusOpen}
            aria-label="System status details"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--nx-border)] bg-[var(--nx-surface)] px-2.5 py-1 font-mono text-[10.5px] tracking-[0.06em] text-[var(--nx-muted)] uppercase transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
          >
            <span
              className={`size-1.5 rounded-full ${
                statusError && !status
                  ? "bg-[var(--nx-bad)]"
                  : status
                    ? status.ok
                      ? "bg-[var(--nx-ok)]"
                      : "bg-[var(--nx-warn)]"
                    : "animate-pulse bg-[var(--nx-idle)]"
              }`}
            />
            {statusError && !status
              ? "Status offline"
              : status
                ? status.ok
                  ? "Operational"
                  : "Degraded"
                : "Checking"}
          </button>
          {statusOpen && (
            <>
              <button
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => setStatusOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-1.5 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.85)]">
                <p className="px-2.5 pt-2 pb-1 font-mono text-[9.5px] tracking-[0.18em] text-[var(--nx-faint)] uppercase">
                  Live backend status
                </p>
                {[
                  { label: "PostgreSQL", state: status?.services.database },
                  { label: "Redis queue", state: status?.services.cache },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center justify-between rounded-xl px-2.5 py-2"
                  >
                    <span className="text-xs text-[var(--nx-muted)]">{s.label}</span>
                    <span className="font-mono text-[11px] tabular-nums text-[var(--nx-ink)]">
                      {s.state ? (
                        <>
                          <span
                            className={s.state.ok ? "text-[var(--nx-ink)]" : "text-[var(--nx-bad)]"}
                          >
                            ●
                          </span>{" "}
                          {s.state.ms}ms
                        </>
                      ) : (
                        <span className="text-[var(--nx-faint)]">probing…</span>
                      )}
                    </span>
                  </div>
                ))}
                <p className="px-2.5 py-2 font-mono text-[10px] text-[var(--nx-faint)]">
                  {statusError && !status ? (
                    <>
                      status unreachable ·{" "}
                      <button
                        onClick={loadStatus}
                        className="underline underline-offset-2 hover:text-[var(--nx-ink)]"
                      >
                        retry
                      </button>
                    </>
                  ) : status ? (
                    <>checked {new Date(status.time).toLocaleTimeString()}</>
                  ) : (
                    "contacting backends…"
                  )}
                </p>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          className="hidden h-9 items-center gap-2.5 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-inset)] px-3 text-xs text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)] sm:inline-flex"
          aria-label="Search repositories"
          onClick={() => window.dispatchEvent(new Event(PALETTE_EVENT))}
        >
          <span className="opacity-70">⌕</span> Search
          <Kbd>⌘K</Kbd>
        </button>
        <ThemeToggle />
        <div className="relative">
          <button
            className="grid size-9 place-items-center overflow-hidden rounded-full transition-transform hover:scale-105"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={`Account menu for ${displayName}`}
          >
            <Avatar tone="sand" className="size-9">
              {avatarText}
            </Avatar>
          </button>
          {menuOpen && (
            <>
              <button
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-1.5 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.85)]"
              >
                <div className="flex items-center gap-2.5 rounded-xl bg-[var(--nx-inset)] p-2.5">
                  <Avatar tone="sand">{avatarText}</Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-[var(--nx-ink)]">
                      {displayName}
                    </p>
                    <p className="truncate text-[11px] text-[var(--nx-faint)]">
                      {user?.email ?? "Signed in"}
                    </p>
                  </div>
                </div>
                <button
                  role="menuitem"
                  className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/settings");
                  }}
                >
                  <UserRound size={15} /> Your profile
                </button>
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/settings");
                  }}
                >
                  <Settings size={15} /> Workspace settings
                </button>
                <div className="my-1.5 h-px bg-[var(--nx-border)]" />
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs text-[var(--nx-bad)] hover:bg-[color-mix(in_srgb,var(--nx-bad)_10%,transparent)]"
                  onClick={async () => {
                    setMenuOpen(false);
                    await fetch("/api/auth/logout", { method: "POST" });
                    router.push("/login");
                    router.refresh();
                  }}
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
