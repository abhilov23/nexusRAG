"""Code graph persistence.

Writes the symbol graph to Neo4j so structural questions -- "what depends on
this", "what breaks if I change it" -- can be answered by traversal rather than
inferred from text similarity.
"""

from __future__ import annotations

import logging
from typing import Any

from ai_service.config import Settings
from ai_service.graphing import GraphBuild

logger = logging.getLogger(__name__)

# Mirrors GRAPH_SCHEMA_STATEMENTS in packages/graph/src/schema.ts.
SCHEMA_STATEMENTS = [
    "CREATE CONSTRAINT symbol_key IF NOT EXISTS "
    "FOR (s:Symbol) REQUIRE (s.repositoryId, s.key) IS UNIQUE",
    "CREATE CONSTRAINT symbol_repository IF NOT EXISTS "
    "FOR (s:Symbol) REQUIRE s.repositoryId IS NOT NULL",
    "CREATE INDEX symbol_name IF NOT EXISTS FOR (s:Symbol) ON (s.name)",
    "CREATE INDEX symbol_path IF NOT EXISTS FOR (s:Symbol) ON (s.path)",
    "CREATE CONSTRAINT file_identity IF NOT EXISTS "
    "FOR (f:File) REQUIRE (f.repositoryId, f.path) IS UNIQUE",
]

# Batched per statement; one round trip per node would dominate the write time
# on a repository with thousands of symbols.
BATCH = 500


def build_driver(settings: Settings):
    from neo4j import GraphDatabase

    uri = settings.neo4j_uri
    if not uri:
        raise RuntimeError("NEO4J_URI is not configured")

    return GraphDatabase.driver(
        uri,
        auth=(settings.neo4j_username or "neo4j", settings.neo4j_password or ""),
        max_connection_lifetime=3600,
        max_connection_pool_size=50,
    )


def ensure_schema(driver) -> bool:
    """Create constraints and indexes. Idempotent."""
    try:
        with driver.session() as session:
            for statement in SCHEMA_STATEMENTS:
                session.run(statement)
        return True
    except Exception as error:  # noqa: BLE001
        logger.warning("could not ensure Neo4j schema: %s", error)
        return False


def write_subgraph(driver, build: GraphBuild, repository_id: str) -> bool:
    """Replace a repository's subgraph. Returns False when Neo4j is unavailable.

    Nodes are written before edges, and the whole write is one transaction per
    batch, so a partial failure cannot leave edges pointing at symbols that were
    never created.
    """
    if not build.nodes:
        return False

    try:
        ensure_schema(driver)

        with driver.session() as session:
            # DETACH DELETE rather than DELETE: dangling edges are how a graph
            # starts returning nodes that point at nothing.
            session.run(
                "MATCH (s:Symbol {repositoryId: $repositoryId}) DETACH DELETE s",
                repositoryId=repository_id,
            )

            for start in range(0, len(build.nodes), BATCH):
                session.run(
                    """
                    UNWIND $rows AS row
                    MERGE (s:Symbol {repositoryId: $repositoryId, key: row.key})
                    SET s.name = row.name, s.kind = row.kind, s.path = row.path,
                        s.language = row.language, s.startLine = row.startLine,
                        s.endLine = row.endLine, s.commitSha = row.commitSha
                    """,
                    repositoryId=repository_id,
                    rows=[
                        {
                            "key": node.key,
                            "name": node.name,
                            "kind": node.kind,
                            "path": node.path,
                            "language": node.language,
                            "startLine": node.start_line,
                            "endLine": node.end_line,
                            "commitSha": node.commit_sha,
                        }
                        for node in build.nodes[start : start + BATCH]
                    ],
                )

            rows = [
                {"from": edge.from_key, "to": edge.to_key, "type": edge.type}
                for edge in build.edges
            ]
            for start in range(0, len(rows), BATCH):
                session.run(
                    """
                    UNWIND $rows AS row
                    MATCH (a:Symbol {repositoryId: $repositoryId, key: row.from}),
                          (b:Symbol {repositoryId: $repositoryId, key: row.to})
                    MERGE (a)-[r:RELATES {type: row.type}]->(b)
                    """,
                    repositoryId=repository_id,
                    rows=rows[start : start + BATCH],
                )

        return True
    except Exception as error:  # noqa: BLE001
        logger.warning("graph write unavailable: %s", error)
        return False


def dependents(
    driver, repository_id: str, symbol_key: str, max_depth: int = 3
) -> list[dict[str, Any]]:
    """What depends on this symbol, transitively."""
    with driver.session() as session:
        result = session.run(
            f"""
            MATCH (target:Symbol {{repositoryId: $repositoryId, key: $symbolKey}})
            MATCH path = (dependent:Symbol)-[:RELATES*1..{max_depth}]->(target)
            WHERE ALL(r IN relationships(path)
                      WHERE r.type IN ['CALLS','IMPORTS','REFERENCES'])
            RETURN DISTINCT dependent.key AS key, dependent.name AS name,
                   dependent.kind AS kind, dependent.path AS path,
                   length(path) AS depth
            ORDER BY depth ASC, dependent.name ASC
            LIMIT 100
            """,
            repositoryId=repository_id,
            symbolKey=symbol_key,
        )
        return [dict(record) for record in result]