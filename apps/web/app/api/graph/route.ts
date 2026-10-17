import { NextResponse } from "next/server";

import { db } from "@repo/database";
import { getCurrentUser } from "@/lib/auth/current-user";
import { RATE_LIMITS, checkRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export type GraphNode = {
  key: string;
  name: string;
  kind: string;
  path: string;
  language: string;
};

export type GraphEdge = {
  from: string;
  to: string;
  type: string;
};

/**
 * Symbol graph for one of the caller's indexed repositories.
 *
 * Scoped to the session's user: the repository id is looked up by (id, userId)
 * so a guessed id belonging to someone else is simply not found.
 *
 * Returns an empty graph rather than an error when Neo4j is unconfigured or
 * unreachable, so the page can say "no graph yet" instead of breaking.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const limit = await checkRateLimit(`graph:${user.id}`, {
      limit: RATE_LIMITS.readQueue.limit,
      windowSeconds: RATE_LIMITS.readQueue.windowSeconds,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "Too many requests." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const repositoryId = new URL(request.url).searchParams.get("repositoryId");
    if (!repositoryId) {
      return NextResponse.json({ message: "A repositoryId is required" }, { status: 400 });
    }

    const repository = await db.repository.findFirst({
      where: { id: repositoryId, userId: user.id },
      select: { id: true, owner: true, name: true, status: true },
    });

    if (!repository) {
      return NextResponse.json({ message: "Repository not found" }, { status: 404 });
    }

    if (!process.env.NEO4J_URI) {
      return NextResponse.json({ nodes: [], edges: [], available: false });
    }

    const { graphSnapshot } = await import("@repo/graph");

    try {
      const snapshot = await graphSnapshot(repository.id, 300);
      return NextResponse.json(
        {
          nodes: snapshot.nodes.map((node) => ({
            key: node.key,
            name: node.name,
            kind: node.kind,
            path: node.path,
            language: node.language,
          })),
          edges: snapshot.edges,
          available: true,
        },
        { headers: rateLimitHeaders(limit) },
      );
    } catch (error) {
      console.error("[graph] Neo4j query failed", error);
      return NextResponse.json({ nodes: [], edges: [], available: false });
    }
  } catch (error) {
    console.error("graph GET error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
