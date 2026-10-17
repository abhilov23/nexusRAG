"""Index a snapshot into every store: vectors, lexical, and graph.

Order matters. Vectors are written first because they are the only store whose
absence makes the repository unsearchable; lexical and graph failures are logged
and skipped, leaving a weaker -- but working -- index rather than a job stuck in
FAILED.
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass, field

from qdrant_client import QdrantClient

from ai_service.config import Settings
from ai_service.graphing import GraphBuild, build_graph, summarise
from ai_service.parsing import Chunk, chunk_file, is_ignored_path
from ai_service.storage.lexical import delete_repository as delete_lexical
from ai_service.storage.lexical import index_chunks as index_lexical
from ai_service.storage.vectors import delete_repository, ensure_collection, index_chunks

logger = logging.getLogger(__name__)


@dataclass
class IndexResult:
    repository_id: str
    commit_sha: str
    files_seen: int = 0
    files_parsed: int = 0
    files_skipped: int = 0
    chunks: int = 0
    vectors: int = 0
    lexical: int = 0
    graph: dict[str, int] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    # Dominant chunk language, measured from what was actually indexed.
    primary_language: str | None = None

    def summary(self) -> str:
        return (
            f"{self.files_parsed}/{self.files_seen} files parsed, "
            f"{self.chunks} chunks, {self.vectors} vectors, "
            f"{self.lexical} lexical, graph {self.graph}"
        )


def chunk_snapshot(
    files: list[tuple[str, bytes]], *, max_file_bytes: int = 2 * 1024 * 1024
) -> tuple[list[Chunk], IndexResult]:
    """Chunk every source file in a snapshot."""
    result = IndexResult(repository_id="", commit_sha="")
    chunks: list[Chunk] = []

    for path, data in files:
        result.files_seen += 1

        if is_ignored_path(path):
            result.files_skipped += 1
            continue
        if len(data) > max_file_bytes:
            result.files_skipped += 1
            continue

        parsed = chunk_file(path, data)
        if parsed.error:
            result.files_skipped += 1
            continue

        result.files_parsed += 1
        chunks.extend(parsed.chunks)

    result.chunks = len(chunks)
    return chunks, result


def index_repository(
    *,
    client: QdrantClient,
    collection: str,
    repository_id: str,
    commit_sha: str,
    files: list[tuple[str, bytes]],
    settings: Settings | None = None,
    batch_size: int = 64,
) -> IndexResult:
    """Chunk and index a whole snapshot across every configured store.

    Old vectors are dropped first: point ids are derived from the chunk identity
    (path + line + symbol), so a commit that deletes code would otherwise leave
    stale points behind forever.
    """
    chunks, result = chunk_snapshot(files)
    result.repository_id = repository_id
    result.commit_sha = commit_sha

    counted = Counter(chunk.language for chunk in chunks if chunk.language)
    if counted:
        result.primary_language = counted.most_common(1)[0][0]

    if not chunks:
        # A commit that empties the repository still has to clear its old
        # vectors and lexical documents, or the previous content stays
        # searchable forever.
        delete_repository(client, collection, repository_id)
        if settings is not None:
            try:
                from ai_service.storage.lexical import build_client

                delete_lexical(build_client(settings), repository_id)
            except Exception as error:  # noqa: BLE001
                logger.warning("could not clear lexical documents: %s", error)
        logger.info("[index] %s produced no chunks; cleared previous vectors", repository_id)
        return result

    # The cleanup delete filters on repositoryId, which requires the keyword
    # payload index. Ensure collection + indexes first: without them the very
    # first operation throws and the job burns all three attempts doing nothing.
    if settings is not None:
        ensure_collection(client, collection, settings.embedding_dimensions)
    delete_repository(client, collection, repository_id)
    result.vectors = index_chunks(
        client,
        collection=collection,
        repository_id=repository_id,
        commit_sha=commit_sha,
        chunks=chunks,
        settings=settings,
        batch_size=batch_size,
    )

    # Lexical and graph are best-effort: vectors alone still answer questions.
    # Skipped entirely when no cluster is configured, so an unconfigured
    # deployment does not pay a connection timeout on every indexing run.
    if settings is not None and settings.elasticsearch_url:
        try:
            from ai_service.storage.lexical import build_client

            search = build_client(settings)
            delete_lexical(search, repository_id)
            result.lexical = index_lexical(search, chunks, repository_id, commit_sha)
        except Exception as error:  # noqa: BLE001
            result.errors.append(f"lexical: {error}")
            logger.warning("lexical indexing failed for %s: %s", repository_id, error)

    return result


def build_subgraph(
    *, repository_id: str, commit_sha: str, files: list[tuple[str, bytes]]
) -> GraphBuild:
    """Derive the symbol graph for a snapshot."""
    chunks, _ = chunk_snapshot(files)
    return build_graph(chunks, repository_id, commit_sha)


def index_graph(
    *, settings: Settings, build: GraphBuild, repository_id: str, result: IndexResult
) -> None:
    """Persist the subgraph, recording the outcome on the result."""
    from ai_service.storage.graph_store import build_driver, write_subgraph

    try:
        driver = build_driver(settings)
        try:
            if write_subgraph(driver, build, repository_id):
                result.graph = summarise(build)
            else:
                result.errors.append("graph: write returned false")
        finally:
            driver.close()
    except Exception as error:  # noqa: BLE001
        result.errors.append(f"graph: {error}")
        logger.warning("graph indexing failed for %s: %s", repository_id, error)