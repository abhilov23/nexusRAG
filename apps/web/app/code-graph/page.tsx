"use client";

import { useMemo, useState } from "react";
import { Boxes, ChevronDown, Code2, FileCode2, GitBranch, Layers3, Search, Sparkles } from "lucide-react";

const repositories = ["agent-runtime", "rag-pipeline", "docs-platform", "eval-harness", "web-console", "vector-store"];

type GraphNode = {
  id: string;
  label: string;
  kind: "repository" | "file" | "function" | "service";
  x: number;
  y: number;
  description: string;
};

const nodes: GraphNode[] = [
  { id: "repo", label: "agent-runtime", kind: "repository", x: 50, y: 11, description: "Repository root and default branch entry point." },
  { id: "chat", label: "src/api/chat.ts", kind: "file", x: 12, y: 34, description: "HTTP routes and request validation for repository chat." },
  { id: "hybrid", label: "src/retrieval/hybrid.py", kind: "file", x: 50, y: 34, description: "Combines vector and keyword retrieval before reranking." },
  { id: "worker", label: "src/indexing/worker.py", kind: "file", x: 88, y: 34, description: "Consumes queued repository indexing jobs." },
  { id: "ask", label: "ChatService.ask", kind: "function", x: 12, y: 62, description: "Builds the retrieval request and streams a cited response." },
  { id: "retrieve", label: "HybridRetriever.retrieve", kind: "function", x: 34, y: 62, description: "Runs vector and BM25 retrieval for the active repository." },
  { id: "fusion", label: "reciprocal_rank_fusion", kind: "function", x: 66, y: 62, description: "Merges ranked result lists using reciprocal rank weights." },
  { id: "run", label: "IndexWorker.run", kind: "function", x: 88, y: 62, description: "Coordinates parsing, chunking, embedding, and index writes." },
  { id: "qdrant", label: "QdrantStore.search", kind: "service", x: 28, y: 86, description: "Returns semantically similar chunks from the vector index." },
  { id: "bm25", label: "BM25Index.query", kind: "service", x: 72, y: 86, description: "Returns lexical matches from the keyword index." },
];
const edges: [string, string][] = [["repo", "chat"], ["repo", "hybrid"], ["repo", "worker"], ["chat", "ask"], ["hybrid", "retrieve"], ["hybrid", "fusion"], ["worker", "run"], ["retrieve", "qdrant"], ["retrieve", "bm25"], ["fusion", "qdrant"], ["fusion", "bm25"]];

export default function CodeGraphPage() {
  const [repository, setRepository] = useState<string>(repositories[0] ?? "agent-runtime");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("hybrid");
  const [showFiles, setShowFiles] = useState(true);
  const [showFunctions, setShowFunctions] = useState(true);
  const [showServices, setShowServices] = useState(true);
  const graphNodes = useMemo(() => nodes.map((node) => node.id === "repo" ? { ...node, label: repository } : node), [repository]) as GraphNode[];
  const branch = repository === "eval-harness" ? "develop" : "main";
  const selected = graphNodes.find((node) => node.id === selectedId);
  const selectedNode = selected ?? graphNodes[0]!;
  const visibleNodes = useMemo(() => graphNodes.filter((node) =>
    (showFiles || node.kind !== "file") &&
    (showFunctions || node.kind !== "function") &&
    (showServices || node.kind !== "service")
  ), [graphNodes, showFiles, showFunctions, showServices]) as GraphNode[];
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const matchingIds = new Set(visibleNodes.filter((node) => `${node.label} ${node.kind}`.toLowerCase().includes(query.trim().toLowerCase())).map((node) => node.id));

  return (
    <div className="graph-page">
      <div className="graph-page-heading">
        <div><span className="graph-page-kicker"><span /> REPOSITORY MAP</span><h1>Code graph<span>.</span></h1><p>Explore how files, functions, and services connect across a repository.</p></div>
        <label className="graph-repo-select"><GitBranch size={14} /><select aria-label="Repository graph" value={repository} onChange={(event) => setRepository(event.target.value)}>{repositories.map((repo) => <option value={repo} key={repo}>{repo}</option>)}</select><ChevronDown size={13} /></label>
      </div>
      <div className="graph-workspace">
        <section className="graph-explorer">
          <div className="graph-toolbar">
            <label><Search size={15} /><input aria-label="Search graph nodes" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files and symbols" /></label>
            <button onClick={() => { setQuery(""); setSelectedId("hybrid"); }}><Sparkles size={14} /> Reset view</button>
          </div>
          <div className="graph-filters">
            <span>SHOW</span>
            <label><input type="checkbox" checked={showFiles} onChange={(event) => setShowFiles(event.target.checked)} /> Files</label>
            <label><input type="checkbox" checked={showFunctions} onChange={(event) => setShowFunctions(event.target.checked)} /> Functions</label>
            <label><input type="checkbox" checked={showServices} onChange={(event) => setShowServices(event.target.checked)} /> Services</label>
            <span className="graph-demo-label"><i /> DEMO SNAPSHOT</span>
          </div>
          <div className="graph-canvas" aria-label={`Dependency graph for ${repository}`}>
            <svg className="graph-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {edges.map(([from, to]) => {
                const source = graphNodes.find((node) => node.id === from);
                const target = graphNodes.find((node) => node.id === to);
                if (!source || !target) return null;
                const isVisible = visibleIds.has(from) && visibleIds.has(to);
                return isVisible ? <line key={`${from}-${to}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className={from === selectedId || to === selectedId ? "is-connected" : ""} /> : null;
              })}
            </svg>
            {visibleNodes.map((node) => {
              const matches = !query || matchingIds.has(node.id);
              const Icon = node.kind === "repository" ? Boxes : node.kind === "file" ? FileCode2 : node.kind === "function" ? Code2 : Layers3;
              return <button key={node.id} className={`graph-node graph-node-${node.kind} ${selectedId === node.id ? "is-selected" : ""} ${matches ? "" : "is-dimmed"}`} style={{ left: `${node.x}%`, top: `${node.y}%` }} onClick={() => setSelectedId(node.id)} aria-pressed={selectedId === node.id}><Icon size={14} /><span>{node.label}</span></button>;
            })}
            {!matchingIds.size && query && <div className="graph-no-results">No matching files or symbols</div>}
          </div>
          <div className="graph-legend"><span><i className="legend-file" /> File</span><span><i className="legend-function" /> Function</span><span><i className="legend-service" /> Service</span><span>{visibleNodes.length} nodes · {edges.filter(([a, b]) => visibleIds.has(a) && visibleIds.has(b)).length} relationships</span></div>
        </section>
        <aside className="graph-inspector">
          <div className="graph-inspector-heading"><div><span>SELECTED NODE</span><strong>{selectedNode.kind}</strong></div><Code2 size={17} /></div>
          <h2>{selectedNode.label}</h2>
          <p>{selectedNode.description}</p>
          <div className="graph-inspector-stats"><div><span>REPOSITORY</span><strong>{repository}</strong></div><div><span>BRANCH</span><strong>{branch}</strong></div><div><span>RELATIONSHIPS</span><strong>{edges.filter(([from, to]) => from === selectedId || to === selectedId).length}</strong></div></div>
          <div className="graph-related"><span>CONNECTED NODES</span>{edges.filter(([from, to]) => from === selectedId || to === selectedId).map(([from, to]) => { const other = graphNodes.find((node) => node.id === (from === selectedId ? to : from))!; return <button key={other.id} onClick={() => setSelectedId(other.id)}><span><i className={`related-dot dot-${other.kind}`} />{other.label}</span><ChevronDown size={13} /></button>; })}</div>
          <div className="graph-snapshot-note">Relationships are shown from a static demo snapshot.</div>
        </aside>
      </div>
    </div>
  );
}