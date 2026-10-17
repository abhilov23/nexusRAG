/** Symbol graph payload, mirroring the Prisma-side RepositoryStatus enum. */

export type GraphNode = {
  key: string;
  name: string;
  kind: "FILE" | "FUNCTION" | "CLASS" | "METHOD" | "INTERFACE" | "MODULE" | string;
  path: string;
  language: string;
};

export type GraphEdge = {
  from: string;
  to: string;
  type: "CONTAINS" | "IMPORTS" | "CALLS" | "EXTENDS" | "IMPLEMENTS" | "REFERENCES" | string;
};

export async function fetchGraph(
  repositoryId: string,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; available: boolean }> {
  const response = await fetch(`/api/graph?repositoryId=${encodeURIComponent(repositoryId)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Graph request failed with status ${response.status}`);
  }

  return (await response.json()) as {
    nodes: GraphNode[];
    edges: GraphEdge[];
    available: boolean;
  };
}
