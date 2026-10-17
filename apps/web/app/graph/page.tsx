"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Code2,
  GitBranch,
  Search,
  Sparkles,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Download,
} from "lucide-react";
import { AppLayout } from "@/app/components/AppLayout";
import { Select } from "@/components/ui/select";
import { listRepositories } from "@/lib/repositories/client";

type NodeType = "repository" | "function" | "service" | "file";

interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  path?: string;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  type: "calls" | "imports" | "contains";
}

interface GraphPayload {
  nodes: { key: string; name: string; kind: string; path: string }[];
  edges: { from: string; to: string; type: string }[];
  available: boolean;
}

const kindToType = (kind: string): NodeType =>
  kind === "FILE" ? "file" : kind === "CLASS" || kind === "INTERFACE" ? "service" : "function";

const buildGraph = (payload: GraphPayload) => {
  const nodes = payload.nodes ?? [];
  const count = nodes.length;
  const radius = Math.max(170, Math.min(280, count * 5));
  const cx = 340;
  const cy = 290;
  const graphNodes: GraphNode[] = nodes.map((node, i) => {
    const angle = (i / Math.max(count, 1)) * Math.PI * 2;
    return {
      id: node.key,
      label: node.name,
      type: kindToType(node.kind),
      path: node.path,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
  const graphLinks: GraphLink[] = (payload.edges ?? []).map((edge) => ({
    source: edge.from,
    target: edge.to,
    type: edge.type === "IMPORTS" ? "imports" : edge.type === "CONTAINS" ? "contains" : "calls",
  }));
  return { graphNodes, graphLinks };
};

const q = (n: number | undefined) => Math.round((n ?? 0) * 100) / 100;

const linkDistance = (link: GraphLink) =>
  link.type === "contains" ? 150 : link.type === "imports" ? 110 : 90;

export default function GraphPage() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<{ stop: () => void } | null>(null);

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [positions, setPositions] = useState<GraphNode[]>([]);
  const [graphAvailable, setGraphAvailable] = useState<boolean | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [repositories, setRepositories] = useState<{ id: string; owner: string; name: string }[]>(
    [],
  );
  const [repositoryId, setRepositoryId] = useState("");
  const [filter, setFilter] = useState("");
  const [showLabels, setShowLabels] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await listRepositories();
        if (!active) return;
        const fetched = rows.map((r) => ({ id: r.id, owner: r.owner, name: r.name }));
        setRepositories(fetched);
        if (fetched.length === 0) return;
        setRepositoryId((current) =>
          fetched.some((r) => r.id === current) ? current : (fetched[0]?.id ?? ""),
        );
      } catch {
        if (!active) return;
        setRepositories([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const fetchGraph = useCallback(async (repoId: string, signal?: AbortSignal) => {
    setGraphLoading(true);
    setGraphError(null);
    setSessionExpired(false);
    try {
      const response = await fetch(`/api/graph?repositoryId=${encodeURIComponent(repoId)}`, {
        credentials: "same-origin",
        signal,
      });
      if (!response.ok) {
        if (response.status === 401) {
          setSessionExpired(true);
          setNodes([]);
          setPositions([]);
          setLinks([]);
          return;
        }
        throw new Error(`Graph API returned ${response.status}`);
      }
      const payload = (await response.json()) as GraphPayload;
      const { graphNodes, graphLinks } = buildGraph(payload);
      setNodes(graphNodes);
      setPositions(graphNodes.map((n) => ({ ...n })));
      setLinks(graphLinks);
      setGraphAvailable(payload.available ?? false);
      setSelectedId(null);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setGraphError(error instanceof Error ? error.message : "Unknown error");
      setNodes([]);
      setPositions([]);
      setLinks([]);
      setGraphAvailable(false);
    } finally {
      setGraphLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!repositoryId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchGraph(repositoryId, controller.signal);
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [repositoryId, fetchGraph]);

  useEffect(() => {
    if (nodes.length === 0) return;
    let disposed = false;

    void import("d3-force")
      .then((d3) => {
        if (disposed) return;
        const width = containerRef.current?.clientWidth || 760;
        const height = containerRef.current?.clientHeight || 560;

        const simNodes = nodes.map((n) => ({ ...n }));
        const simIds = new Set(simNodes.map((n) => n.id));
        // forceLink throws "node not found" on dangling links, so drop any link
        // whose endpoints the payload did not include.
        const simLinks = links
          .filter((l) => simIds.has(l.source) && simIds.has(l.target))
          .map((l) => ({ ...l }));

        const simulation = d3
          .forceSimulation<GraphNode>(simNodes)
          .force(
            "link",
            d3
              .forceLink<GraphNode, GraphLink>(simLinks)
              .id((d: GraphNode) => d.id)
              .distance(linkDistance)
              .strength(0.7),
          )
          .force("charge", d3.forceManyBody().strength(-420))
          .force("center", d3.forceCenter(width / 2, height / 2))
          .force("collide", d3.forceCollide().radius(64))
          .alphaDecay(0.02)
          .velocityDecay(0.4);

        let scheduled = false;
        const publish = () => {
          if (scheduled || disposed) return;
          scheduled = true;
          requestAnimationFrame(() => {
            scheduled = false;
            if (!disposed) setPositions(simNodes.map((n) => ({ ...n })));
          });
        };

        simulation.on("tick", publish);
        simulation.on("end", publish);
        publish();

        simRef.current = simulation;
      })
      .catch(() => {
        /* The force layout is an enhancement — if it cannot run, the graph
         stays on its seeded radial positions instead of crashing. */
      });

    return () => {
      disposed = true;
      simRef.current?.stop();
      simRef.current = null;
    };
  }, [nodes, links]);

  const nodeMap = useMemo(() => new Map(positions.map((n) => [n.id, n])), [positions]);

  const visibleNodes = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return positions;
    return positions.filter(
      (n) =>
        n.label.toLowerCase().includes(needle) ||
        n.type.toLowerCase().includes(needle) ||
        n.path?.toLowerCase().includes(needle),
    );
  }, [positions, filter]);

  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  const selectedNode = selectedId ? (nodeMap.get(selectedId) ?? null) : null;

  const neighborIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const ids = new Set<string>();
    for (const link of links) {
      if (link.source === selectedId) ids.add(link.target);
      if (link.target === selectedId) ids.add(link.source);
    }
    return ids;
  }, [links, selectedId]);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z * 1.2, 3)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z / 1.2, 0.3)), []);
  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (repositoryId) void fetchGraph(repositoryId);
  }, [repositoryId, fetchGraph]);

  const handleExport = useCallback(() => {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `code-graph-${repositoryId || "export"}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [repositoryId]);

  const handleWheel = useCallback((event: React.WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      setZoom((z) => Math.min(Math.max(z * (event.deltaY > 0 ? 0.9 : 1.1), 0.3), 3));
    }
  }, []);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      isDraggingRef.current = true;
      dragStartRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
    },
    [pan],
  );

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    setPan({
      x: event.clientX - dragStartRef.current.x,
      y: event.clientY - dragStartRef.current.y,
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const statusText = graphLoading
    ? "Loading symbol graph…"
    : sessionExpired
      ? "Session expired — please log in again"
      : nodes.length > 0
        ? `${nodes.length} indexed symbols · ${links.length} relationships`
        : graphAvailable === false
          ? "Graph store unreachable"
          : graphError
            ? graphError
            : "No symbol graph yet";

  return (
    <AppLayout>
      <div className="w-full px-5 pt-8 pb-14 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0 max-w-[640px]">
            <p className="font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
              Code graph
            </p>
            <h1 className="font-display mt-2 text-[clamp(28px,3.4vw,40px)] leading-[1.04] font-semibold tracking-[-0.03em] text-[var(--nx-ink)]">
              Code graph
            </h1>
            <p className="mt-2.5 max-w-[560px] text-[13.5px] leading-relaxed text-[var(--nx-muted)]">
              Nodes are functions, services, and files. Edges are calls, imports, and containment —
              read from the index, not drawn by hand.
            </p>
          </div>
          <Select
            id="graph-repo"
            name="graph-repo"
            ariaLabel="Repository graph"
            value={repositoryId}
            onChange={setRepositoryId}
            options={repositories.map((repo) => ({
              value: repo.id,
              label: `${repo.owner}/${repo.name}`,
            }))}
            placeholder="No repositories yet"
            emptyLabel="No repositories yet"
            icon={<GitBranch size={14} />}
            className="max-w-[300px]"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-2.5">
          <label
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl bg-[var(--nx-inset)] px-3 text-[var(--nx-muted)] sm:max-w-[260px]"
            htmlFor="graph-filter"
          >
            <Search size={14} className="shrink-0" />
            <input
              id="graph-filter"
              name="graph-filter"
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter nodes…"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--nx-ink)] outline-none placeholder:text-[var(--nx-faint)]"
            />
          </label>
          <label
            className="flex h-9 cursor-pointer items-center gap-2 rounded-xl px-2.5 text-[12.5px] text-[var(--nx-muted)] hover:text-[var(--nx-ink)]"
            htmlFor="graph-labels"
          >
            <input
              id="graph-labels"
              name="graph-labels"
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="accent-[var(--nx-ink)]"
            />
            Labels
          </label>
          <span className="mr-auto font-mono text-[10.5px] tracking-[0.08em] text-[var(--nx-faint)] uppercase sm:mr-0 sm:ml-auto">
            {statusText}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="grid size-9 place-items-center rounded-xl text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
              onClick={handleZoomIn}
              aria-label="Zoom in"
            >
              <ZoomIn size={15} />
            </button>
            <button
              className="grid size-9 place-items-center rounded-xl text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
              onClick={handleZoomOut}
              aria-label="Zoom out"
            >
              <ZoomOut size={15} />
            </button>
            <button
              className="grid size-9 place-items-center rounded-xl text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
              onClick={handleResetView}
              aria-label="Reset view"
            >
              <RefreshCw size={15} />
            </button>
            <button
              className="grid size-9 place-items-center rounded-xl text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)]"
              onClick={handleExport}
              aria-label="Export graph as SVG"
            >
              <Download size={15} />
            </button>
          </div>
        </div>

        <div className="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div
            ref={containerRef}
            className="relative h-[560px] overflow-hidden rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)]"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: "grab" }}
          >
            <svg className="absolute inset-0 h-full w-full">
              <defs>
                <pattern id="graph-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path
                    d="M 40 0 L 0 0 0 40"
                    fill="none"
                    stroke="var(--nx-border)"
                    strokeWidth="0.5"
                  />
                </pattern>
                <marker
                  id="arrow-calls"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <path d="M0,0 L0,7 L9,3.5 Z" fill="var(--nx-muted)" />
                </marker>
                <marker
                  id="arrow-imports"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <path d="M0,0 L0,7 L9,3.5 Z" fill="var(--nx-ink)" />
                </marker>
                <marker
                  id="arrow-contains"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <path d="M0,0 L0,7 L9,3.5 Z" fill="var(--nx-faint)" />
                </marker>
              </defs>
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                <rect x="-4000" y="-4000" width="9000" height="9000" fill="url(#graph-grid)" />
                <g>
                  {links.map((link, i) => {
                    const source = nodeMap.get(link.source);
                    const target = nodeMap.get(link.target);
                    if (
                      source?.x === undefined ||
                      source?.y === undefined ||
                      target?.x === undefined ||
                      target?.y === undefined
                    )
                      return null;
                    if (
                      filter.trim() &&
                      (!visibleIds.has(link.source) || !visibleIds.has(link.target))
                    )
                      return null;
                    const connected =
                      selectedId !== null &&
                      (link.source === selectedId || link.target === selectedId);
                    const dimmed = selectedId !== null && !connected;
                    const markerId =
                      link.type === "imports"
                        ? "arrow-imports"
                        : link.type === "contains"
                          ? "arrow-contains"
                          : "arrow-calls";
                    return (
                      <line
                        key={`edge-${i}`}
                        x1={q(source.x)}
                        y1={q(source.y)}
                        x2={q(target.x)}
                        y2={q(target.y)}
                        stroke={connected ? "var(--nx-ink)" : "var(--nx-border-strong)"}
                        strokeWidth={connected ? 1.6 : 1}
                        opacity={dimmed ? 0.18 : 0.75}
                        markerEnd={`url(#${markerId})`}
                      />
                    );
                  })}
                </g>
                <g>
                  {visibleNodes.map((node) => {
                    if (node.x === undefined || node.y === undefined) return null;
                    const isSelected = selectedId === node.id;
                    const isNeighbor = neighborIds.has(node.id);
                    const dimmed = selectedId !== null && !isSelected && !isNeighbor;
                    const labelWidth = node.label.length * 6.4 + 26;
                    return (
                      <g
                        key={node.id}
                        transform={`translate(${q(node.x)}, ${q(node.y)})`}
                        opacity={dimmed ? 0.25 : 1}
                        style={{ cursor: "pointer" }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => setSelectedId(isSelected ? null : node.id)}
                      >
                        <circle
                          r={isSelected ? 6.5 : 4.5}
                          fill={isSelected ? "var(--nx-ink)" : "var(--nx-muted)"}
                          stroke="var(--nx-surface)"
                          strokeWidth={2}
                        />
                        {showLabels && (
                          <g transform="translate(11, 0)">
                            <rect
                              x={0}
                              y={-11}
                              width={labelWidth}
                              height={22}
                              rx={7}
                              fill="var(--nx-surface)"
                              stroke={isSelected ? "var(--nx-ink)" : "var(--nx-border)"}
                              strokeWidth={isSelected ? 1.4 : 1}
                            />
                            <text
                              x={10}
                              y={4}
                              fontSize={11}
                              fontFamily="'DM Mono', ui-monospace, monospace"
                              fill="var(--nx-ink)"
                            >
                              {node.label}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>
              </g>
            </svg>

            {visibleNodes.length === 0 && (
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <Code2 size={28} className="mx-auto text-[var(--nx-faint)]" />
                  {graphError ? (
                    <>
                      <p className="mt-2 text-[13px] text-[var(--nx-bad)]">{graphError}</p>
                      <p className="mt-1 text-[11px] text-[var(--nx-faint)]">
                        Check the browser console for details.
                      </p>
                    </>
                  ) : graphLoading ? (
                    <p className="mt-2 text-[13px] text-[var(--nx-muted)]">Loading symbol graph…</p>
                  ) : sessionExpired ? (
                    <>
                      <p className="mt-2 text-[13px] text-[var(--nx-bad)]">
                        Session expired — please log in again.
                      </p>
                      <button
                        className="mt-3 inline-flex h-9 items-center rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)] px-4 text-[13px] text-[var(--nx-ink)] hover:border-[var(--nx-border-strong)]"
                        onClick={() => router.push("/login")}
                      >
                        Sign in
                      </button>
                    </>
                  ) : filter.trim() ? (
                    <p className="mt-2 text-[13px] text-[var(--nx-muted)]">
                      No nodes match your filter
                    </p>
                  ) : (
                    <p className="mt-2 text-[13px] text-[var(--nx-muted)]">
                      Nothing to draw yet — the graph appears once a repository finishes indexing.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-bg)] px-3 py-2">
              {[
                { label: "Repository", icon: <GitBranch size={12} /> },
                { label: "Function", icon: <Code2 size={12} /> },
                { label: "Service", icon: <Sparkles size={12} /> },
                { label: "File", icon: <Code2 size={12} /> },
              ].map((item) => (
                <span
                  key={item.label}
                  className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--nx-muted)]"
                >
                  <span className="inline-flex text-[var(--nx-ink)]">{item.icon}</span>
                  {item.label}
                </span>
              ))}
            </div>
            <p className="pointer-events-none absolute right-3 bottom-3 hidden font-mono text-[10px] text-[var(--nx-faint)] sm:block">
              Ctrl + scroll to zoom · drag to pan
            </p>
          </div>

          <aside className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-5">
            {selectedNode ? (
              <>
                <p className="font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
                  {selectedNode.type}
                </p>
                <h3
                  className="font-display mt-1.5 truncate text-[18px] font-semibold tracking-tight text-[var(--nx-ink)]"
                  title={selectedNode.label}
                >
                  {selectedNode.label}
                </h3>
                <p
                  className="mt-1 truncate font-mono text-[11px] text-[var(--nx-faint)]"
                  title={selectedNode.path}
                >
                  {selectedNode.path}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-[var(--nx-border)] bg-[var(--nx-border)]">
                  {[
                    {
                      label: "Incoming",
                      value: links.filter((l) => l.target === selectedNode.id).length,
                    },
                    {
                      label: "Outgoing",
                      value: links.filter((l) => l.source === selectedNode.id).length,
                    },
                    { label: "Type", value: selectedNode.type },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-[var(--nx-surface)] px-3 py-2.5">
                      <p className="font-mono text-[9px] tracking-[0.16em] text-[var(--nx-faint)] uppercase">
                        {stat.label}
                      </p>
                      <p className="mt-1 truncate text-[13px] font-semibold text-[var(--nx-ink)]">
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
                  Connected nodes
                </p>
                <div className="mt-2 grid gap-1.5">
                  {links
                    .filter((l) => l.source === selectedNode.id || l.target === selectedNode.id)
                    .slice(0, 10)
                    .map((link, i) => {
                      const otherId = link.source === selectedNode.id ? link.target : link.source;
                      const otherNode = nodeMap.get(otherId);
                      if (!otherNode) return null;
                      return (
                        <button
                          key={`${selectedNode.id}-${otherId}-${i}`}
                          onClick={() => setSelectedId(otherNode.id)}
                          className="flex items-center gap-2 rounded-xl border border-[var(--nx-border)] px-3 py-2 text-left text-[12px] text-[var(--nx-muted)] transition-colors hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
                        >
                          <span className="min-w-0 flex-1 truncate">{otherNode.label}</span>
                          <ChevronRight size={12} className="shrink-0" />
                        </button>
                      );
                    })}
                  {links.filter((l) => l.source === selectedNode.id || l.target === selectedNode.id)
                    .length === 0 && (
                    <p className="text-[12px] text-[var(--nx-faint)]">No relationships recorded.</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
                  Inspector
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--nx-muted)]">
                  Select a node to inspect its incoming and outgoing relationships.
                </p>
                <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--nx-faint)]">
                  <Sparkles size={13} className="mt-0.5 shrink-0" />
                  {nodes.length > 0
                    ? "Read from the symbol graph built at index time."
                    : "Nothing to draw yet — the graph appears once a repository finishes indexing."}
                </p>
              </>
            )}
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}
