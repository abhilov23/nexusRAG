"use client";

import { useMemo, useState } from "react";
import { Activity, Check, CircleAlert, Clock3, GitBranch, LoaderCircle, RefreshCw, Search, UploadCloud } from "lucide-react";

type JobStatus = "Completed" | "Indexing" | "Queued" | "Failed";
type RepositoryJob = { name: string; branch: string; status: JobStatus; progress?: number; updated: string; chunks: string };
const initialJobs: RepositoryJob[] = [
  { name: "agent-runtime", branch: "main", status: "Completed", updated: "12 min ago", chunks: "24.8k" },
  { name: "rag-pipeline", branch: "main", status: "Indexing", progress: 62, updated: "Started 4 min ago", chunks: "—" },
  { name: "docs-platform", branch: "main", status: "Completed", updated: "Yesterday at 4:32 PM", chunks: "18.2k" },
  { name: "eval-harness", branch: "develop", status: "Completed", updated: "Yesterday at 1:08 PM", chunks: "9.6k" },
  { name: "web-console", branch: "main", status: "Failed", updated: "Failed 2 hours ago", chunks: "—" },
  { name: "vector-store", branch: "main", status: "Completed", updated: "May 18, 2025", chunks: "11.4k" },
];

function JobBadge({ status }: { status: JobStatus }) {
  const Icon = status === "Completed" ? Check : status === "Indexing" ? LoaderCircle : status === "Failed" ? CircleAlert : Clock3;
  return <span className={`sync-job-badge sync-job-${status.toLowerCase()}`}><Icon size={13} className={status === "Indexing" ? "spin" : ""} />{status}</span>;
}

export default function SyncPage() {
  const [jobs, setJobs] = useState(initialJobs);
  const [filter, setFilter] = useState("");
  const [syncingAll, setSyncingAll] = useState(false);
  const [lastChecked, setLastChecked] = useState("Just now");
  const visibleJobs = useMemo(() => jobs.filter((job) => job.name.toLowerCase().includes(filter.trim().toLowerCase())), [jobs, filter]);
  const completed = jobs.filter((job) => job.status === "Completed").length;
  const active = jobs.filter((job) => job.status === "Indexing" || job.status === "Queued").length;
  const runJob = (name: string) => {
    setJobs((current) => current.map((job) => job.name === name ? { ...job, status: "Indexing", progress: 18, updated: "Started just now" } : job));
    window.setTimeout(() => {
      setJobs((current) => current.map((job) => job.name === name ? { ...job, status: "Completed", progress: undefined, updated: "Just now", chunks: job.chunks === "—" ? "8.1k" : job.chunks } : job));
      setLastChecked("Just now");
      setSyncingAll(false);
    }, 3000);
  };
  const syncAll = () => {
    setSyncingAll(true);
    jobs.filter((job) => job.status !== "Indexing").forEach((job) => runJob(job.name));
  };
  const refreshStatus = () => setLastChecked("Just now");

  return (
    <div className="sync-page">
      <div className="sync-page-heading">
        <div><span className="sync-page-kicker"><span /> PIPELINE STATUS</span><h1>Ingestion & sync<span>.</span></h1><p>Monitor repository indexing jobs and retry failed runs.</p></div>
        <button className="sync-all-button" onClick={syncAll} disabled={syncingAll}><RefreshCw size={15} className={syncingAll ? "spin" : ""} />{syncingAll ? "Syncing repositories" : "Sync all repositories"}</button>
      </div>
      <div className="sync-demo-banner"><Activity size={16} /><span><strong>Demo pipeline</strong> Job status and indexing progress are simulated locally; no source repositories are fetched.</span><span><i /> Healthy</span></div>
      <div className="sync-summary-grid">
        <div><span>CONNECTED REPOSITORIES</span><strong>{jobs.length}</strong><small>Connected in this workspace</small></div>
        <div><span>COMPLETED</span><strong>{completed}<small> / {jobs.length}</small></strong><small>Latest indexing runs</small></div>
        <div><span>ACTIVE JOBS</span><strong>{active}</strong><small>Queued or indexing</small></div>
      </div>
      <div className="sync-jobs-heading"><div><h2>Repository jobs</h2><p>Latest sync and indexing activity by repository.</p></div><div className="sync-job-tools"><label><Search size={14} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter repositories" aria-label="Filter sync jobs" /></label><button onClick={refreshStatus}><RefreshCw size={13} /> Refresh</button></div></div>
      <div className="sync-table-wrap"><table className="sync-table"><thead><tr><th>REPOSITORY</th><th>BRANCH</th><th>STATUS</th><th>CODE CHUNKS</th><th>LAST ACTIVITY</th><th> </th></tr></thead><tbody>{visibleJobs.map((job) => <tr key={job.name}><td><span className="sync-repo-icon"><GitBranch size={14} /></span><strong>nexus-labs / {job.name}</strong></td><td><span className="sync-branch"><GitBranch size={12} />{job.branch}</span></td><td><JobBadge status={job.status} />{job.status === "Indexing" && <div className="sync-progress"><i style={{ width: `${job.progress ?? 0}%` }} /></div>}</td><td>{job.chunks}</td><td>{job.updated}</td><td><button className="sync-row-action" onClick={() => runJob(job.name)} disabled={job.status === "Indexing"}><RefreshCw size={13} />{job.status === "Failed" ? "Retry" : "Re-index"}</button></td></tr>)}</tbody></table>{visibleJobs.length === 0 && <div className="sync-empty">No repositories match this filter.</div>}</div>
      <div className="sync-footer"><span><UploadCloud size={14} /> Changes are processed after a sync run starts.</span><span>Last checked {lastChecked}</span></div>
    </div>
  );
}