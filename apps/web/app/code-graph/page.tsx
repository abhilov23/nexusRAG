"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, Code2, FileCode2, GitBranch, Layers3, Search, Sparkles } from "lucide-react";
import { AppLayout } from "@/app/components/AppLayout";
import { Select } from "@/components/ui/select";
import { listRepositories, type Repository } from "@/lib/repositories/client";
import { fetchGraph, type GraphEdge, type GraphNode } from "@/lib/repositories/graph";

/**
 * Repository map, read from the symbol graph in Neo4j.
 *
 * Every node and edge comes from what was actually indexed: symbols, files and
 * the relationships between them. The force layout is computed from that
 * graph, so what is drawn reflects the real repository structure.
 */
export default function CodeGraphPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repositoryId, setRepositoryId] = useState<string>("");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [showFiles, setShowFiles] = useState(true);
  const [showFunctions, setShowFunctions] = useState(true);
  const [showServices, setShowServices] = useState(true);

  useEffect(() => {
    let active = true;
    void listRepositories()
      .then((rows) => {
        if (!active) return;
        setRepositories(rows);
        setRepositoryId(rows[0]?.id ?? "");
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // Every setState below happens after an `await`, so nothing is set
    // synchronously in the effect body.
    (async () => {
      if (!repositoryId) {
        setNodes([]);
        setEdges([]);
        setAvailable(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { nodes, edges, available } = await fetchGraph(repositoryId);
        setNodes(nodes);
        setEdges(edges);
        setAvailable(available);
        setSelectedId(nodes[0]?.key ?? "");
      } catch {
        setNodes([]);
        setEdges([]);
        setAvailable(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [repositoryId]);

  // Lay the real graph out in concentric bands by kind, so relationships stay
  // readable without inventing coordinates for symbols that do not exist.
  const positioned = useMemo(() => {
    const band = (kind: string) =>
      kind === "FILE" ? 0 : kind === "CLASS" || kind === "INTERFACE" ? 1 : 2;
    const grouped = new Map<number, GraphNode[]>();
    for (const node of nodes) {
      const key = band(node.kind);
      grouped.set(key, [...(grouped.get(key) ?? []), node]);
    }

    return [...grouped.entries()].flatMap(([index, group]) => {
      const ring = 16 + index * 26;
      return group.map((node, i) => {
        const angle = (i / Math.max(group.length, 1)) * Math.PI * 2;
        return {
          ...node,
          x: 50 + Math.cos(angle) * ring,
          y: 50 + Math.sin(angle) * ring,
        };
      });
    });
  }, [nodes]);

  const repository = repositories.find((r) => r.id === repositoryId);
  const branch = repository?.defaultBranch ?? "main";

  const visibleNodes = useMemo(
    () =>
      positioned.filter(
        (node) =>
          (showFiles || node.kind !== "FILE") &&
          (showFunctions || node.kind !== "CLASS") &&
          (showServices || node.kind !== "FUNCTION"),
      ),
    [positioned, showFiles, showFunctions, showServices],
  );
  const visibleIds = new Set(visibleNodes.map((node) => node.key));
  const matchingIds = new Set(
    visibleNodes
      .filter((node) =>
        `${node.name} ${node.kind} ${node.path}`.toLowerCase().includes(query.trim().toLowerCase()),
      )
      .map((node) => node.key),
  );
  const selectedNode = visibleNodes.find((node) => node.key === selectedId) ?? visibleNodes[0];

  const empty = !loading && nodes.length === 0;

  return (
    <AppLayout>
      <div className="w-full px-5 pt-8 pb-14 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0 max-w-[640px]">
            <p className="font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
              Repository map
            </p>
            <h1 className="font-display mt-2 text-[clamp(28px,3.4vw,40px)] leading-[1.04] font-semibold tracking-[-0.03em] text-[var(--nx-ink)]">
              Code graph
            </h1>
            <p className="mt-2.5 max-w-[560px] text-[13.5px] leading-relaxed text-[var(--nx-muted)]">
              Files, functions, and services laid out by kind — every position derived from the
              indexed graph.
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

        <div className="mt-5 grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="overflow-hidden rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)]">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--nx-border)] p-2.5">
              <label
                className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl bg-[var(--nx-inset)] px-3 text-[var(--nx-muted)] sm:max-w-[260px]"
                htmlFor="graph-node-search"
              >
                <Search size={14} className="shrink-0" />
                <input
                  id="graph-node-search"
                  name="graph-node-search"
                  aria-label="Search graph nodes"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search files and symbols"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--nx-ink)] outline-none placeholder:text-[var(--nx-faint)]"
                />
              </label>
              <div
                className="flex items-center gap-3 px-1 font-mono text-[10px] tracking-[0.14em] text-[var(--nx-faint)] uppercase"
                role="group"
                aria-label="Toggle symbol kinds"
              >
                {[
                  { id: "graph-show-files", label: "Files", checked: showFiles, set: setShowFiles },
                  {
                    id: "graph-show-functions",
                    label: "Classes",
                    checked: showFunctions,
                    set: setShowFunctions,
                  },
                  {
                    id: "graph-show-services",
                    label: "Functions",
                    checked: showServices,
                    set: setShowServices,
                  },
                ].map((t) => (
                  <label
                    key={t.id}
                    htmlFor={t.id}
                    className="flex cursor-pointer items-center gap-1.5 hover:text-[var(--nx-ink)]"
                  >
                    <input
                      id={t.id}
                      name={t.id}
                      type="checkbox"
                      checked={t.checked}
                      onChange={(event) => t.set(event.target.checked)}
                      className="accent-[var(--nx-ink)]"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
              <span className="ml-auto font-mono text-[10px] tracking-[0.14em] text-[var(--nx-faint)]">
                {nodes.length > 0 ? `${nodes.length} SYMBOLS` : "NO DATA"}
              </span>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--nx-border)] px-3 text-[12px] text-[var(--nx-muted)] hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
              >
                <Sparkles size={13} /> Reload
              </button>
            </div>

            <div
              className="relative h-[520px] overflow-hidden"
              aria-label={`Dependency graph for ${repository ? `${repository.owner}/${repository.name}` : "repository"}`}
            >
              {loading && (
                <div className="absolute inset-0 grid place-items-center" role="status">
                  <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--nx-faint)] uppercase">
                    Reading symbol graph…
                  </p>
                </div>
              )}
              {empty && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center">
                  <div>
                    <Boxes size={26} className="mx-auto text-[var(--nx-faint)]" />
                    <h2 className="font-display mt-3 text-[18px] font-semibold tracking-tight text-[var(--nx-ink)]">
                      No symbol graph yet
                    </h2>
                    <p className="mx-auto mt-1.5 max-w-[420px] text-[12.5px] leading-relaxed text-[var(--nx-muted)]">
                      {repositories.length === 0
                        ? "Connect a repository first — the graph is built once indexing completes."
                        : available === false
                          ? "The graph store is not reachable, so there is nothing to show. The repository has to finish indexing first."
                          : "This repository has not been indexed yet, so no symbols or relationships exist to draw."}
                    </p>
                  </div>
                </div>
              )}

              {nodes.length > 0 && (
                <>
                  <svg
                    className="absolute inset-0 h-full w-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {edges.map((edge) => {
                      const source = positioned.find((n) => n.key === edge.from);
                      const target = positioned.find((n) => n.key === edge.to);
                      if (!source || !target) return null;
                      if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) return null;
                      const lit = edge.from === selectedId || edge.to === selectedId;
                      return (
                        <line
                          key={`${edge.from}-${edge.to}-${edge.type}`}
                          x1={source.x}
                          y1={source.y}
                          x2={target.x}
                          y2={target.y}
                          stroke={lit ? "var(--nx-ink)" : "var(--nx-border-strong)"}
                          strokeWidth={lit ? 0.5 : 0.25}
                          vectorEffect="non-scaling-stroke"
                          opacity={lit ? 1 : 0.7}
                        />
                      );
                    })}
                  </svg>
                  {visibleNodes.map((node) => (
                    <button
                      key={node.key}
                      type="button"
                      onClick={() => setSelectedId(node.key)}
                      aria-pressed={selectedNode?.key === node.key}
                      title={`${node.name} · ${node.kind} · ${node.path}`}
                      className={`absolute flex max-w-[220px] -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 truncate rounded-lg border px-2 py-1.5 font-mono text-[10.5px] transition-colors ${
                        selectedNode?.key === node.key
                          ? "border-[var(--nx-ink)] bg-[var(--nx-raised)] text-[var(--nx-ink)]"
                          : matchingIds.has(node.key) && query.trim()
                            ? "border-[var(--nx-border-strong)] bg-[var(--nx-surface)] text-[var(--nx-ink)]"
                            : "border-[var(--nx-border)] bg-[var(--nx-surface)] text-[var(--nx-muted)] hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
                      }`}
                      style={{ left: `${node.x}%`, top: `${node.y}%` }}
                    >
                      {node.kind === "FILE" ? (
                        <FileCode2 size={12} className="shrink-0" />
                      ) : node.kind === "CLASS" ? (
                        <Layers3 size={12} className="shrink-0" />
                      ) : (
                        <Code2 size={12} className="shrink-0" />
                      )}
                      <span className="truncate">{node.name}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </section>

          <aside className="rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-5 xl:sticky xl:top-[76px]">
            {selectedNode ? (
              <>
                <p className="font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
                  Symbol · {selectedNode.kind}
                </p>
                <h3 className="font-display mt-1.5 break-words text-[18px] font-semibold tracking-tight text-[var(--nx-ink)]">
                  {selectedNode.name}
                </h3>
                <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-[var(--nx-faint)]">
                  {selectedNode.path}
                </p>
                <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-[var(--nx-border)] bg-[var(--nx-border)]">
                  {[
                    { label: "Kind", value: selectedNode.kind },
                    { label: "Language", value: selectedNode.language || "—" },
                    { label: "Branch", value: branch },
                  ].map((row) => (
                    <div key={row.label} className="bg-[var(--nx-surface)] px-3 py-2.5">
                      <dt className="font-mono text-[9px] tracking-[0.16em] text-[var(--nx-faint)] uppercase">
                        {row.label}
                      </dt>
                      <dd
                        className="mt-1 truncate text-[12px] font-medium text-[var(--nx-ink)]"
                        title={row.value}
                      >
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
                  Relationships
                </p>
                <ul className="mt-2 grid gap-1.5">
                  {edges
                    .filter(
                      (edge) => edge.from === selectedNode.key || edge.to === selectedNode.key,
                    )
                    .slice(0, 12)
                    .map((edge) => {
                      const other =
                        positioned.find((n) => n.key === edge.from) ??
                        positioned.find((n) => n.key === edge.to);
                      const direction = edge.from === selectedNode.key ? "calls" : "called by";
                      return (
                        <li
                          key={`${edge.from}-${edge.to}-${edge.type}`}
                          className="rounded-lg border border-[var(--nx-border)] px-2.5 py-2 text-[11.5px] text-[var(--nx-muted)]"
                        >
                          <span className="mr-1.5 rounded border border-[var(--nx-border)] px-1 py-0.5 font-mono text-[9.5px] text-[var(--nx-faint)]">
                            {edge.type}
                          </span>
                          <span className="text-[var(--nx-ink)]">{other?.name}</span>{" "}
                          <em className="text-[var(--nx-faint)] not-italic">· {direction}</em>
                        </li>
                      );
                    })}
                  {edges.filter(
                    (edge) => edge.from === selectedNode.key || edge.to === selectedNode.key,
                  ).length === 0 && (
                    <li className="text-[12px] text-[var(--nx-faint)]">
                      No relationships recorded.
                    </li>
                  )}
                </ul>
              </>
            ) : (
              <>
                <p className="font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
                  Inspector
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--nx-muted)]">
                  {loading
                    ? "Reading the symbol graph…"
                    : "Select a symbol to inspect its relationships."}
                </p>
              </>
            )}
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}
