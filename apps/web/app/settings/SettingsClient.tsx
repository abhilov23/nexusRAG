"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Building2,
  Check,
  Database,
  Loader2,
  Moon,
  Save,
  Sun,
  UserRound,
} from "lucide-react";
import { useTheme } from "@/app/context/ThemeContext";
import { AppLayout } from "@/app/components/AppLayout";
import { PageHeader } from "@/components/ui/sections";
import { Select } from "@/components/ui/select";
import { DEFAULT_PREFERENCES, type UserPreferences } from "@/lib/auth/preferences";
import { cn } from "@/lib/utils";

function PreferenceSwitch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-[var(--nx-border)] px-5 py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <strong className="block text-[13px] font-semibold text-[var(--nx-ink)]">{label}</strong>
        <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--nx-muted)]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
          checked
            ? "border-[var(--nx-ink)] bg-[var(--nx-ink)]"
            : "border-[var(--nx-border-strong)] bg-[var(--nx-inset)]",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 size-4 -translate-y-1/2 rounded-full transition-all",
            checked ? "left-[22px] bg-[var(--nx-bg)]" : "left-[3px] bg-[var(--nx-faint)]",
          )}
        />
      </button>
    </div>
  );
}

function Section({
  icon,
  title,
  lede,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)]">
      <div className="flex items-center gap-3 border-b border-[var(--nx-border)] px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--nx-border)] bg-[var(--nx-inset)] text-[var(--nx-muted)]">
          {icon}
        </span>
        <div>
          <h2 className="text-[14px] font-semibold tracking-tight text-[var(--nx-ink)]">{title}</h2>
          <p className="text-[12px] text-[var(--nx-muted)]">{lede}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border border-[var(--nx-border)] bg-[var(--nx-inset)] px-3 text-[13px] text-[var(--nx-ink)] outline-none transition-colors placeholder:text-[var(--nx-faint)] focus:border-[var(--nx-ink)]";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [reposConnected, setReposConnected] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    fetch("/api/auth/me", { credentials: "same-origin", signal: controller.signal })
      .then((res) => {
        if (res.status === 401) throw new Error("Not authenticated");
        if (!res.ok) throw new Error("Could not load your settings");
        return res.json();
      })
      .then(
        (data: { user: { name: string | null; email: string }; preferences: UserPreferences }) => {
          if (!active) return;
          setPreferences({ ...DEFAULT_PREFERENCES, ...data.preferences });
          setFullName(data.user.name ?? "");
          setEmail(data.user.email);
        },
      )
      .catch((err: Error) => {
        if (active) {
          setError(
            err instanceof DOMException && err.name === "AbortError"
              ? "Settings took too long to load. Retry."
              : err.message,
          );
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      });

    fetch("/api/repositories", { credentials: "same-origin", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && Array.isArray(data.repositories)) {
          setReposConnected(data.repositories.length);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  const updatePreference = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      setPreferences((current) => ({ ...current, [key]: value }));
      setSaved(false);
    },
    [],
  );

  const saveSettings = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      const res = await fetch("/api/auth/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...preferences, name: fullName.trim() || null }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? "Could not save your settings");
      }

      const data = await res.json();
      setPreferences({ ...DEFAULT_PREFERENCES, ...data.preferences });
      setFullName(data.user.name ?? "");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="w-full px-5 pt-8 pb-14 sm:px-8">
        <PageHeader
          eyebrow="Workspace preferences"
          title="Settings."
          lede="Manage your workspace, indexing behavior, and personal preferences."
        />

        {error && (
          <div
            className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--nx-bad)] bg-[color-mix(in_srgb,var(--nx-bad)_8%,transparent)] px-4 py-3"
            role="alert"
          >
            <p className="text-[12.5px] text-[var(--nx-bad)]">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="ml-auto h-8 rounded-lg border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3 text-[12px] text-[var(--nx-ink)] hover:border-[var(--nx-border-strong)]"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div
            className="flex items-center gap-2.5 rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] px-5 py-8"
            role="status"
          >
            <Loader2 size={17} className="animate-spin text-[var(--nx-muted)]" />
            <span className="text-[13px] text-[var(--nx-muted)]">Loading your settings…</span>
          </div>
        ) : (
          <form onSubmit={saveSettings}>
            <div className="grid items-start gap-4 xl:grid-cols-2">
              <div className="grid gap-4">
                <Section
                  icon={<Building2 size={16} />}
                  title="Workspace"
                  lede="Details shared across this workspace."
                >
                  <div className="grid gap-3 p-5 sm:grid-cols-2">
                    <label className="block text-[12px] font-semibold text-[var(--nx-ink)]">
                      Workspace name
                      <input
                        value={preferences.workspaceName}
                        onChange={(event) => updatePreference("workspaceName", event.target.value)}
                        maxLength={60}
                        required
                        className={cn(inputCls, "mt-1.5")}
                      />
                    </label>
                    <label className="block text-[12px] font-semibold text-[var(--nx-ink)]">
                      Workspace URL
                      <span className="mt-1.5 flex h-10 items-center rounded-xl border border-[var(--nx-border)] bg-[var(--nx-inset)] pl-3 text-[13px] focus-within:border-[var(--nx-ink)]">
                        <span className="shrink-0 font-mono text-[12px] text-[var(--nx-faint)]">
                          nexusrag.app/
                        </span>
                        <input
                          aria-label="Workspace URL slug"
                          value={preferences.workspaceSlug}
                          onChange={(event) =>
                            updatePreference("workspaceSlug", event.target.value)
                          }
                          pattern="[a-z0-9][a-z0-9\-]*"
                          required
                          className="h-full min-w-0 flex-1 bg-transparent px-1 font-mono text-[12.5px] text-[var(--nx-ink)] outline-none"
                        />
                      </span>
                    </label>
                  </div>
                  <p className="flex items-center gap-2 border-t border-[var(--nx-border)] px-5 py-3.5 text-[12px] text-[var(--nx-muted)]">
                    <Database size={14} className="text-[var(--nx-faint)]" />
                    <strong className="font-semibold tabular-nums text-[var(--nx-ink)]">
                      {reposConnected === null ? "—" : reposConnected} repositories
                    </strong>
                    connected
                  </p>
                </Section>

                <Section
                  icon={<UserRound size={16} />}
                  title="Your profile"
                  lede="Account information and display name."
                >
                  <div className="grid gap-3 p-5 sm:grid-cols-2">
                    <label className="block text-[12px] font-semibold text-[var(--nx-ink)]">
                      Full name
                      <input
                        value={fullName}
                        onChange={(event) => {
                          setFullName(event.target.value);
                          setSaved(false);
                        }}
                        placeholder="Your name"
                        maxLength={80}
                        className={cn(inputCls, "mt-1.5")}
                      />
                    </label>
                    <label className="block text-[12px] font-semibold text-[var(--nx-ink)]">
                      Email address
                      <input
                        value={email}
                        readOnly
                        aria-readonly="true"
                        className={cn(inputCls, "mt-1.5 opacity-60")}
                      />
                    </label>
                  </div>
                </Section>

                <Section icon={<Sun size={16} />} title="Appearance" lede="Saved on this device.">
                  <div
                    className="flex flex-wrap items-center gap-2 p-5"
                    role="group"
                    aria-label="Color theme"
                  >
                    {[
                      { value: "light" as const, label: "Light", icon: <Sun size={14} /> },
                      { value: "dark" as const, label: "Dark", icon: <Moon size={14} /> },
                      { value: "system" as const, label: "System", icon: null },
                    ].map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        aria-pressed={theme === t.value}
                        onClick={() => setTheme(t.value)}
                        className={cn(
                          "inline-flex h-9 items-center gap-2 rounded-xl border px-3.5 text-[12.5px] transition-colors",
                          theme === t.value
                            ? "border-[var(--nx-ink)] bg-[var(--nx-ink)] font-semibold text-[var(--nx-bg)]"
                            : "border-[var(--nx-border)] text-[var(--nx-muted)] hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]",
                        )}
                      >
                        {t.icon}
                        {t.label}
                      </button>
                    ))}
                  </div>
                </Section>
              </div>
              <div className="grid gap-4">
                <Section
                  icon={<Database size={16} />}
                  title="Indexing"
                  lede="Defaults for keeping context fresh."
                >
                  <PreferenceSwitch
                    label="Index new commits automatically"
                    description="Refresh repository context when the default branch changes."
                    checked={preferences.autoIndex}
                    onChange={() => updatePreference("autoIndex", !preferences.autoIndex)}
                  />
                  <div className="flex items-center gap-4 border-b border-[var(--nx-border)] px-5 py-4 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <strong className="block text-[13px] font-semibold text-[var(--nx-ink)]">
                        Default branch
                      </strong>
                      <p className="mt-0.5 text-[12px] text-[var(--nx-muted)]">
                        Used when opening a repository chat.
                      </p>
                    </div>
                    <Select
                      ariaLabel="Default branch"
                      value={preferences.defaultBranch}
                      onChange={(next) =>
                        updatePreference("defaultBranch", next as UserPreferences["defaultBranch"])
                      }
                      options={[
                        { value: "main", label: "main" },
                        { value: "develop", label: "develop" },
                        { value: "release", label: "release" },
                      ]}
                      variant="inset"
                      size="sm"
                      className="shrink-0"
                      triggerClassName="font-mono text-[12px]"
                    />
                  </div>
                  <PreferenceSwitch
                    label="Include source citations"
                    description="Show file references alongside generated answers."
                    checked={preferences.citations}
                    onChange={() => updatePreference("citations", !preferences.citations)}
                  />
                </Section>

                <Section
                  icon={<Bell size={16} />}
                  title="Notifications"
                  lede="Which workspace updates you see."
                >
                  <PreferenceSwitch
                    label="Indexing alerts"
                    description="Let me know when a repository index succeeds or needs attention."
                    checked={preferences.indexAlerts}
                    onChange={() => updatePreference("indexAlerts", !preferences.indexAlerts)}
                  />
                  <PreferenceSwitch
                    label="Weekly workspace summary"
                    description="A short recap of indexing activity and workspace usage."
                    checked={preferences.weeklySummary}
                    onChange={() => updatePreference("weeklySummary", !preferences.weeklySummary)}
                  />
                </Section>
              </div>
            </div>

            <div className="sticky bottom-4 mt-4 flex items-center gap-3 rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] px-4 py-3">
              <span
                role="status"
                className="inline-flex items-center gap-1.5 text-[12px] text-[var(--nx-muted)]"
              >
                {saved && (
                  <>
                    <Check size={14} className="text-[var(--nx-ink)]" /> Settings saved.
                  </>
                )}
              </span>
              <button
                type="submit"
                disabled={saving}
                className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--nx-signal)] px-5 text-[13px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85 disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
