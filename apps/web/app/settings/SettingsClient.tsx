"use client";

import { useState } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  Database,
  Moon,
  Save,
  Sun,
  UserRound,
  Building2,
} from "lucide-react";
import { useTheme } from "@/app/context/ThemeContext";

type Preferences = {
  autoIndex: boolean;
  indexAlerts: boolean;
  weeklySummary: boolean;
  citations: boolean;
};

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
    <div className="settings-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <button
        type="button"
        className={`settings-switch ${checked ? "is-on" : ""}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
      >
        <span />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const [workspaceName, setWorkspaceName] = useState(
    () =>
      typeof window !== "undefined"
        ? window.localStorage.getItem("nexus-setting-workspace-name") ?? "Nexus Labs"
        : "Nexus Labs",
  );
  const [workspaceSlug, setWorkspaceSlug] = useState(
    () =>
      typeof window !== "undefined"
        ? window.localStorage.getItem("nexus-setting-workspace-slug") ?? "nexus-labs"
        : "nexus-labs",
  );
  const [fullName, setFullName] = useState(
    () =>
      typeof window !== "undefined"
        ? window.localStorage.getItem("nexus-setting-full-name") ?? "Abhilov Gupta"
        : "Abhilov Gupta",
  );
  const [email, setEmail] = useState(
    () =>
      typeof window !== "undefined"
        ? window.localStorage.getItem("nexus-setting-email") ?? "abhilov@nexuslabs.dev"
        : "abhilov@nexuslabs.dev",
  );
  const [branch, setBranch] = useState(
    () =>
      typeof window !== "undefined"
        ? window.localStorage.getItem("nexus-setting-branch") ?? "main"
        : "main",
  );
  const [saved, setSaved] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(() => ({
    autoIndex:
      typeof window !== "undefined"
        ? window.localStorage.getItem("nexus-setting-auto-index") !== "false"
        : true,
    indexAlerts:
      typeof window !== "undefined"
        ? window.localStorage.getItem("nexus-setting-index-alerts") !== "false"
        : true,
    weeklySummary:
      typeof window !== "undefined"
        ? window.localStorage.getItem("nexus-setting-weekly-summary") === "true"
        : false,
    citations:
      typeof window !== "undefined"
        ? window.localStorage.getItem("nexus-setting-citations") !== "false"
        : true,
  }));
  const updatePreference = (key: keyof Preferences) => {
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
    setSaved(false);
  };
  const saveSettings = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typeof window !== "undefined") {
      window.localStorage.setItem("nexus-setting-workspace-name", workspaceName);
      window.localStorage.setItem("nexus-setting-workspace-slug", workspaceSlug);
      window.localStorage.setItem("nexus-setting-full-name", fullName);
      window.localStorage.setItem("nexus-setting-email", email);
      window.localStorage.setItem("nexus-setting-branch", branch);
      window.localStorage.setItem(
        "nexus-setting-auto-index",
        String(preferences.autoIndex),
      );
      window.localStorage.setItem(
        "nexus-setting-index-alerts",
        String(preferences.indexAlerts),
      );
      window.localStorage.setItem(
        "nexus-setting-weekly-summary",
        String(preferences.weeklySummary),
      );
      window.localStorage.setItem(
        "nexus-setting-citations",
        String(preferences.citations),
      );
    }
    setSaved(true);
  };

  return (
    <div className="settings-page">
      <div className="settings-heading">
        <div>
          <span className="settings-eyebrow">WORKSPACE PREFERENCES</span>
          <h1>
            Settings<span>.</span>
          </h1>
          <p>
            Manage your workspace, indexing behavior, and personal preferences.
          </p>
        </div>
        <div className="settings-plan">
          <span /> Free workspace
        </div>
      </div>

      <form onSubmit={saveSettings}>
        <section className="settings-section">
          <div className="settings-section-heading">
            <span className="settings-section-icon">
              <Building2 size={16} />
            </span>
            <div>
              <h2>Workspace</h2>
              <p>Details shared with everyone in this workspace.</p>
            </div>
          </div>
          <div className="settings-card settings-fields">
            <label className="settings-field">
              Workspace name
              <input
                value={workspaceName}
                onChange={(event) => {
                  setWorkspaceName(event.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <label className="settings-field">
              Workspace URL
              <span className="settings-input-prefix">
                <span>nexusrag.app/</span>
                <input
                  aria-label="Workspace URL slug"
                  value={workspaceSlug}
                  onChange={(event) => {
                    setWorkspaceSlug(event.target.value);
                    setSaved(false);
                  }}
                />
              </span>
            </label>
            <div className="settings-workspace-note">
              <Database size={14} />
              <span>
                <strong>6 repositories</strong> connected · 64.0k code chunks
                indexed
              </span>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <span className="settings-section-icon">
              <UserRound size={16} />
            </span>
            <div>
              <h2>Your profile</h2>
              <p>Personal account information and display preferences.</p>
            </div>
          </div>
          <div className="settings-card settings-profile-grid">
            <label className="settings-field">
              Full name
              <input
                value={fullName}
                onChange={(event) => {
                  setFullName(event.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <label className="settings-field">
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setSaved(false);
                }}
              />
            </label>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <span className="settings-section-icon">
              <Sun size={16} />
            </span>
            <div>
              <h2>Appearance</h2>
              <p>Choose how NexusRAG looks on this device.</p>
            </div>
          </div>
          <div className="settings-card settings-appearance">
            <div>
              <strong>Color theme</strong>
              <p>Your preference is saved for future visits.</p>
            </div>
            <div className="settings-theme-control" aria-label="Color theme">
              <button
                type="button"
                className={theme === "light" ? "selected" : ""}
                onClick={() => theme !== "light" && toggleTheme()}
              >
                <Sun size={14} />
                Light
              </button>
              <button
                type="button"
                className={theme === "dark" ? "selected" : ""}
                onClick={() => theme !== "dark" && toggleTheme()}
              >
                <Moon size={14} />
                Dark
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <span className="settings-section-icon">
              <Database size={16} />
            </span>
            <div>
              <h2>Indexing</h2>
              <p>Set defaults for keeping repository context up to date.</p>
            </div>
          </div>
          <div className="settings-card settings-options-card">
            <PreferenceSwitch
              label="Index new commits automatically"
              description="Refresh repository context when the default branch changes."
              checked={preferences.autoIndex}
              onChange={() => updatePreference("autoIndex")}
            />
            <label className="settings-select-row">
              <span>
                <strong>Default branch</strong>
                <small>Used when opening a repository chat.</small>
              </span>
              <span className="settings-select-wrap">
                <select
                  value={branch}
                  onChange={(event) => {
                    setBranch(event.target.value);
                    setSaved(false);
                  }}
                >
                  <option value="main">main</option>
                  <option value="develop">develop</option>
                  <option value="release">release</option>
                </select>
                <ChevronDown size={13} />
              </span>
            </label>
            <PreferenceSwitch
              label="Include source citations"
              description="Show file references alongside generated answers."
              checked={preferences.citations}
              onChange={() => updatePreference("citations")}
            />
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <span className="settings-section-icon">
              <Bell size={16} />
            </span>
            <div>
              <h2>Notifications</h2>
              <p>Choose which workspace updates you want to see.</p>
            </div>
          </div>
          <div className="settings-card settings-options-card">
            <PreferenceSwitch
              label="Indexing alerts"
              description="Let me know when a repository index succeeds or needs attention."
              checked={preferences.indexAlerts}
              onChange={() => updatePreference("indexAlerts")}
            />
            <PreferenceSwitch
              label="Weekly workspace summary"
              description="A short recap of indexing activity and workspace usage."
              checked={preferences.weeklySummary}
              onChange={() => updatePreference("weeklySummary")}
            />
          </div>
        </section>

        <div className="settings-save-row">
          <span role="status">
            {saved && (
              <>
                <Check size={14} /> Settings saved to this browser.
              </>
            )}
          </span>
          <button className="settings-save-button" type="submit">
            <Save size={14} />
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}