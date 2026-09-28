"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Code2,
  Ellipsis,
  ExternalLink,
  GitBranch,
  GitFork,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";

type RepoStatus = "Completed" | "Indexing" | "Queued" | "Failed";
type Repo = {
  name: string;
  language: string;
  color: string;
  status: RepoStatus;
  indexed: string;
  branch: string;
  chunks: string;
  progress?: number;
};
const startingRepos: Repo[] = [
  {
    name: "nexus-labs / agent-runtime",
    language: "TypeScript",
    color: "#4f9cff",
    status: "Completed",
    indexed: "12 min ago",
    branch: "main",
    chunks: "24.8k",
  },
  {
    name: "nexus-labs / rag-pipeline",
    language: "Python",
    color: "#f4ca64",
    status: "Indexing",
    indexed: "Started 4 min ago",
    branch: "main",
    chunks: "—",
    progress: 62,
  },
  {
    name: "nexus-labs / docs-platform",
    language: "TypeScript",
    color: "#4f9cff",
    status: "Completed",
    indexed: "Yesterday at 4:32 PM",
    branch: "main",
    chunks: "18.2k",
  },
  {
    name: "nexus-labs / eval-harness",
    language: "Python",
    color: "#f4ca64",
    status: "Completed",
    indexed: "Yesterday at 1:08 PM",
    branch: "develop",
    chunks: "9.6k",
  },
  {
    name: "nexus-labs / web-console",
    language: "TypeScript",
    color: "#4f9cff",
    status: "Failed",
    indexed: "Failed 2 hours ago",
    branch: "main",
    chunks: "—",
  },
  {
    name: "nexus-labs / vector-store",
    language: "Go",
    color: "#50c5c1",
    status: "Completed",
    indexed: "May 18, 2025",
    branch: "main",
    chunks: "11.4k",
  },
];

function StatusBadge({ status }: { status: RepoStatus }) {
  const Icon =
    status === "Completed"
      ? Check
      : status === "Indexing"
      ? LoaderCircle
      : status === "Failed"
      ? CircleAlert
      : Clock3;
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <Icon size={12} className={status === "Indexing" ? "spin" : ""} />
      {status}
    </span>
  );
}

export default function WorkspacePage() {
  const [repos, setRepos] = useState(startingRepos);
  const [addOpen, setAddOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [repoError, setRepoError] = useState("");
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [lastSync, setLastSync] = useState("12 min ago");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const sortedRepos = [...repos].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "status") {
      const rank: Record<RepoStatus, number> = { Indexing: 0, Queued: 1, Failed: 2, Completed: 3 };
      return rank[a.status] - rank[b.status] || a.name.localeCompare(b.name);
    }
    return 0;
  });
  const filteredRepos = sortedRepos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(filter.trim().toLowerCase()) ||
      repo.language.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const indexedChunks = repos.reduce((total, repo) => {
    const chunks = Number.parseFloat(repo.chunks);
    return total + (Number.isFinite(chunks) ? chunks : 0);
  }, 0);
  const indexedLanguages = new Set(repos.map((repo) => repo.language).filter((language) => language !== "Detecting")).size;
  const activeJobs = repos.filter((repo) => repo.status === "Indexing" || repo.status === "Queued").length;
  const startIndexing = (name: string) => {
    setRepos((current) => {
      const target = current.find((repo) => repo.name === name);
      if (!target) return current;
      return [
        { ...target, status: "Indexing", indexed: "Indexing started just now", progress: 18 },
        ...current.filter((repo) => repo.name !== name),
      ];
    });
    setMenuFor(null);
    window.setTimeout(() => {
      setRepos((current) =>
        current.map((repo) =>
          repo.name === name
            ? {
                ...repo,
                status: "Completed",
                indexed: "Just now",
                chunks: repo.chunks === "—" ? "8.1k" : repo.chunks,
                progress: undefined,
              }
            : repo,
        ),
      );
      setLastSync("Just now");
    }, 3000);
  };
  const addRepository = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = repoUrl.trim();
    if (
      !/^https:\/\/(github\.com|gitlab\.com)\/[\w.-]+\/[\w.-]+\/?$/.test(
        trimmed,
      )
    ) {
      setRepoError("Enter a valid GitHub or GitLab repository URL.");
      return;
    }
    const repoPath = trimmed
      .replace(/\/$/, "")
      .split("/")
      .slice(-2)
      .join(" / ");
    if (repos.some((repo) => repo.name.toLowerCase() === repoPath.toLowerCase())) {
      setRepoError("This repository is already in your workspace.");
      return;
    }
    setRepos((current) => [
      {
        name: repoPath,
        language: "Detecting",
        color: "#a6a6ba",
        status: "Queued",
        indexed: "Waiting to index",
        branch: "main",
        chunks: "—",
      },
      ...current,
    ]);
    setRepoUrl("");
    setRepoError("");
    setAddOpen(false);
    window.setTimeout(() => {
      setRepos((current) =>
        current.map((repo) =>
          repo.name === repoPath
            ? {
                ...repo,
                status: "Indexing",
                indexed: "Indexing started just now",
                progress: 12,
              }
            : repo,
        ),
      );
      window.setTimeout(() => {
        setRepos((current) =>
          current.map((repo) =>
            repo.name === repoPath
              ? {
                  ...repo,
                  status: "Completed",
                  indexed: "Just now",
                  chunks: "8.1k",
                  progress: undefined,
                }
              : repo,
          ),
        );
        setLastSync("Just now");
      }, 3400);
    }, 1000);
  };

  return (
    <div className="workspace-page">
      <div className="page-eyebrow">
        <span className="eyebrow-line" />
        REPOSITORY WORKSPACE
      </div>
      <div className="workspace-heading">
        <div>
          <h1>
            Your knowledge base<span className="heading-period">.</span>
          </h1>
          <p>Connect your code. Ask better questions.</p>
        </div>
        <button className="primary-button" onClick={() => setAddOpen(true)}>
          <Plus size={17} />
          Add repository
        </button>
      </div>
      <div className="welcome-banner">
        <div className="banner-glow" />
        <div className="banner-icon">
          <Sparkles size={18} />
        </div>
        <div className="banner-copy">
          <strong>Your codebase, ready to reason.</strong>
          <span>
            Connect a repository to start building a context-aware AI workspace.
          </span>
        </div>
        <button className="banner-action" onClick={() => setAddOpen(true)}>
          Connect a repo <ArrowUpRight size={14} />
        </button>
        <div className="banner-orbit orbit-one" />
        <div className="banner-orbit orbit-two" />
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">CONNECTED REPOSITORIES</span>
          <div className="stat-value">
            {repos.length}
            <span className="stat-unit"> repos</span>
          </div>
          <span className="stat-note">
            <GitFork size={13} /> Across {indexedLanguages} languages
          </span>
          <div className="stat-symbol symbol-blue">
            <GitBranch size={25} />
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-label">CODE CHUNKS INDEXED</span>
          <div className="stat-value">
            {indexedChunks.toFixed(1)}<span className="stat-unit">k</span>
          </div>
          <span className="stat-note">
            <ArrowUpRight size={13} /> <b>12.8%</b> this week
          </span>
          <div className="mini-bars">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-label">LAST SYNC</span>
          <div className="stat-value stat-time">
            {lastSync === "12 min ago" ? <>12<span className="stat-unit"> min ago</span></> : <span className="stat-unit">{lastSync}</span>}
          </div>
          <span className="stat-note">
            <span className="online-dot" /> {activeJobs ? `${activeJobs} repos indexing` : "Everything up to date"}
          </span>
          <div className="stat-symbol symbol-green">
            <Activity size={24} />
          </div>
        </div>
      </div>
      <div className="repo-section-heading">
        <div>
          <div className="section-title-row">
            <h2>Repositories</h2>
            <span className="count-pill">{repos.length}</span>
          </div>
          <p>Manage the codebases powering your AI context.</p>
        </div>
        <div className="repo-tools">
          <label className="repo-search">
            <Search size={15} />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter repositories"
            />
            <kbd>/</kbd>
          </label>
          <label className="sort-control">
            <select
              aria-label="Sort repositories"
              className="sort-button"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              <option value="recent">Recently indexed</option>
              <option value="name">Name A–Z</option>
              <option value="status">Status</option>
            </select>
            <ChevronDown size={14} />
          </label>
        </div>
      </div>
      <div className="repo-grid">
        {filteredRepos.map((repo, index) => (
          <article
            className="repo-card"
            key={`${repo.name}-${index}`}
            role="group"
            tabIndex={0}
            aria-label={`Open details for ${repo.name}`}
            onClick={() => setSelectedRepo(repo)}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                setSelectedRepo(repo);
              }
            }}
          >
            <div className="repo-card-top">
              <div
                className="repo-icon"
                style={{ "--repo-color": repo.color } as React.CSSProperties}
              >
                <Code2 size={18} />
              </div>
              <div className="repo-title-wrap">
                <h3>
                  <button
                    className="repo-title-button"
                    onClick={() => setSelectedRepo(repo)}
                  >
                    {repo.name}
                  </button>
                </h3>
                <div className="repo-meta">
                  <span
                    className="language-dot"
                    style={{ background: repo.color }}
                  />
                  {repo.language}
                  <span className="meta-divider" />
                  <GitBranch size={12} />
                  {repo.branch}
                </div>
              </div>
              <div
                className="repo-menu-wrap"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className="icon-button repo-menu-button"
                  aria-label={`Options for ${repo.name}`}
                  onClick={() =>
                    setMenuFor(menuFor === repo.name ? null : repo.name)
                  }
                >
                  <Ellipsis size={18} />
                </button>
                {menuFor === repo.name && (
                  <div className="repo-menu">
                    <button onClick={() => startIndexing(repo.name)}>
                      <RefreshCw size={14} />
                      Re-index
                    </button>
                    <button onClick={() => { setSelectedRepo(repo); setMenuFor(null); }}>
                      <ExternalLink size={14} />
                      Repository details
                    </button>
                    <button
                      className="delete-action"
                      onClick={() => {
                        setRepos((current) =>
                          current.filter((item) => item.name !== repo.name),
                        );
                        setMenuFor(null);
                      }}
                    >
                      <X size={14} />
                      Delete repository
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="repo-status-row">
              <StatusBadge status={repo.status} />
              {repo.status === "Indexing" && (
                <span className="index-progress-label">
                  {repo.progress ?? 62}%
                </span>
              )}
            </div>
            {repo.status === "Indexing" && (
              <div className="index-progress">
                <span style={{ width: `${repo.progress ?? 62}%` }} />
              </div>
            )}
            {repo.status === "Failed" && (
              <div className="failed-note">
                Couldn't access repository. Check permissions.
              </div>
            )}
            <div className="repo-card-footer">
              <span>
                <Clock3 size={13} />
                {repo.indexed}
              </span>
              <span>
                {repo.chunks} <span className="chunk-caption">chunks</span>
              </span>
            </div>
          </article>
        ))}
        <button className="add-repo-card" onClick={() => setAddOpen(true)}>
          <span className="add-card-icon">
            <Plus size={18} />
          </span>
          <strong>Add a repository</strong>
          <span>Bring another codebase into your workspace</span>
          <ArrowUpRight size={15} className="add-card-arrow" />
        </button>
      </div>
      {filteredRepos.length === 0 && (
        <div className="empty-state">
          <Search size={22} />
          <strong>No repositories found</strong>
          <span>Try a different search term.</span>
        </div>
      )}
      <div className="workspace-footer">
        <span>
          <span className="online-dot" />
          Indexer is healthy
        </span>
        <span>
          Last synced {lastSync} <RefreshCw size={12} />
        </span>
      </div>
      {selectedRepo && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedRepo(null);
          }}
        >
          <section
            className="repo-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="repo-detail-title"
          >
            <div className="repo-detail-header">
              <div>
                <span className="repo-detail-overline">
                  REPOSITORY OVERVIEW
                </span>
                <span className="repo-detail-state">
                  <span
                    className="language-dot"
                    style={{ background: selectedRepo.color }}
                  />
                  {selectedRepo.language}
                </span>
              </div>
              <button
                className="modal-close"
                onClick={() => setSelectedRepo(null)}
                aria-label="Close repository details"
              >
                <X size={18} />
              </button>
            </div>
            <div className="repo-detail-title-row">
              <div
                className="repo-icon"
                style={{
                  "--repo-color": selectedRepo.color,
                } as React.CSSProperties}
              >
                <Code2 size={18} />
              </div>
              <div>
                <h2 id="repo-detail-title">{selectedRepo.name}</h2>
                <span>
                  <GitBranch size={12} />
                  {selectedRepo.branch}
                  <span className="detail-divider" />
                  Updated {selectedRepo.indexed}
                </span>
              </div>
              <span className="repo-detail-source">Connected source</span>
            </div>
            <p className="repo-detail-description">
              Indexed repository context for understanding architecture,
              implementation details, and code ownership across your workspace.
            </p>
            <div className="repo-detail-metrics">
              <div>
                <span>INDEX STATUS</span>
                <StatusBadge status={selectedRepo.status} />
              </div>
              <div>
                <span>CODE CHUNKS</span>
                <strong>{selectedRepo.chunks}</strong>
              </div>
              <div>
                <span>DEFAULT BRANCH</span>
                <strong>
                  <GitBranch size={12} />
                  {selectedRepo.branch}
                </strong>
              </div>
              <div>
                <span>LAST INDEXED</span>
                <strong>
                  <Clock3 size={12} />
                  {selectedRepo.indexed}
                </strong>
              </div>
            </div>
            <div className="repo-detail-graph">
              <div className="repo-graph-heading">
                <div>
                  <span>INDEX ACTIVITY</span>
                  <strong>Codebase growth</strong>
                </div>
                <span className="graph-period">
                  Last 7 days <ChevronDown size={12} />
                </span>
              </div>
              <div className="repo-graph-wrap">
                <div className="repo-graph-y">
                  <span>8k</span>
                  <span>6k</span>
                  <span>4k</span>
                  <span>2k</span>
                </div>
                <div className="repo-graph">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <svg
                    viewBox="0 0 640 110"
                    preserveAspectRatio="none"
                    aria-label="Repository index activity chart"
                  >
                    <defs>
                      <linearGradient
                        id="repo-area-fill"
                        x1="0"
                        x2="0"
                        y1="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#b9684e"
                          stopOpacity=".2"
                        />
                        <stop
                          offset="100%"
                          stopColor="#b9684e"
                          stopOpacity="0"
                        />
                      </linearGradient>
                    </defs>
                    <path
                      className="repo-graph-area"
                      d="M0 85 C40 82 55 58 96 65 S160 79 192 54 S255 70 288 44 S350 55 384 38 S447 62 480 32 S545 45 576 20 S620 32 640 12 L640 110 L0 110Z"
                    />
                    <path
                      className="repo-graph-line"
                      d="M0 85 C40 82 55 58 96 65 S160 79 192 54 S255 70 288 44 S350 55 384 38 S447 62 480 32 S545 45 576 20 S620 32 640 12"
                    />
                  </svg>
                  <div className="repo-graph-x">
                    <span>May 13</span>
                    <span>May 14</span>
                    <span>May 15</span>
                    <span>May 16</span>
                    <span>May 17</span>
                    <span>May 18</span>
                    <span>Today</span>
                  </div>
                </div>
              </div>
              <div className="repo-graph-legend">
                <span>
                  <i />
                  Indexed chunks
                </span>
                <b>
                  <ArrowUpRight size={12} />
                  8.4% this week
                </b>
              </div>
            </div>
            <div className="repo-detail-bottom">
              <div>
                <span>RECENT ACTIVITY</span>
                <p>
                  <Check size={13} />
                  Repository indexed successfully <small>12 min ago</small>
                </p>
                <p>
                  <GitBranch size={13} />
                  Branch <b>{selectedRepo.branch}</b> synced{" "}
                  <small>3 hours ago</small>
                </p>
              </div>
              <Link
                href={`/chat?repo=${selectedRepo.name.split(" / ").pop()}`}
                className="repo-detail-chat"
                onClick={() => setSelectedRepo(null)}
              >
                Ask this repository <ArrowUpRight size={14} />
              </Link>
            </div>
          </section>
        </div>
      )}
      {addOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAddOpen(false);
          }}
        >
          <section
            className="add-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-title"
          >
            <button
              className="modal-close"
              onClick={() => setAddOpen(false)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <div className="modal-icon">
              <GitBranch size={19} />
            </div>
            <p className="modal-kicker">EXPAND YOUR CONTEXT</p>
            <h2 id="add-title">Add a repository</h2>
            <p className="modal-description">
              Connect a public GitHub or GitLab repository. In this demo, repository status and indexing are simulated locally.
            </p>
            <form onSubmit={addRepository}>
              <label htmlFor="repo-url">Repository URL</label>
              <div className="url-input-wrap">
                <GitBranch size={16} />
                <input
                  id="repo-url"
                  autoFocus
                  value={repoUrl}
                  onChange={(event) => {
                    setRepoUrl(event.target.value);
                    setRepoError("");
                  }}
                  placeholder="https://github.com/org/repository"
                />
              </div>
              {repoError && <span className="form-error">{repoError}</span>}
              <div className="modal-note">
                <span className="private-lock">⌑</span> Private repositories need a connected provider account.
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  <Plus size={16} />
                  Connect repository
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}