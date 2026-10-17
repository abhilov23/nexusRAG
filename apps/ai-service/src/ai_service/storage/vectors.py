"""Qdrant vector store for code chunks.

Uses a deterministic point id per chunk so re-indexing a commit replaces its
vectors instead of duplicating them, and so a partially-failed reindex can be
cleaned up by deleting the repository's points.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from qdrant_client import QdrantClient, models

from ai_service.ai import embed_batched
from ai_service.config import Settings
from ai_service.parsing import Chunk

logger = logging.getLogger(__name__)

# Namespace so these ids can never collide with anything else in the cluster.
_ID_NAMESPACE = uuid.UUID("6f1c2b4e-3a5d-4c7f-9b8e-0a1b2c3d4e5f")


def point_id(repository_id: str, chunk: Chunk) -> str:
    """Stable UUID for a chunk, derived from its identity."""
    return str(uuid.uuid5(_ID_NAMESPACE, f"{repository_id}:{chunk.chunk_id}"))


def _payload(repository_id: str, commit_sha: str, chunk: Chunk) -> dict[str, Any]:
    return {
        "repositoryId": repository_id,
        "commitSha": commit_sha,
        "path": chunk.path,
        "language": chunk.language,
        "symbol": chunk.symbol,
        "kind": chunk.kind,
        "startLine": chunk.start_line,
        "endLine": chunk.end_line,
        "content": chunk.content,
        "imports": list(chunk.imports),
    }


def ensure_collection(client: QdrantClient, collection: str, dimensions: int) -> None:
    """Create the collection if it is missing or has the wrong vector size."""
    if client.collection_exists(collection):
        info = client.get_collection(collection)
        current = info.config.params.vectors
        size = (
            current.get("size")
            if isinstance(current, dict)
            else getattr(current, "size", None)
        )
        if size == dimensions:
            ensure_payload_indexes(client, collection)
            return
        # A dimension change makes old vectors unusable; rebuild rather than
        # silently mixing incompatible shapes.
        client.delete_collection(collection)

    client.create_collection(
        collection_name=collection,
        vectors_config=models.VectorParams(size=dimensions, distance=models.Distance.COSINE),
    )
    ensure_payload_indexes(client, collection)


def ensure_payload_indexes(client: QdrantClient, collection: str) -> None:
    """Index the payload keys every read path filters on.

    Without a keyword index on `repositoryId`, per-repository deletes and
    filtered searches fail with "Index required but not found" on strict
    Qdrant Cloud collections.

    Verified, not fire-and-forget: the schema is read back, a conflicting
    non-keyword index is dropped and recreated, and failures raise instead
    of being swallowed.
    """
    for key in ("repositoryId", "commitSha"):
        try:
            client.create_payload_index(
                collection_name=collection,
                field_name=key,
                field_schema=models.PayloadSchemaType.KEYWORD,
            )
        except Exception as error:  # noqa: BLE001 - may already exist; verify below
            logger.debug("payload index create for %s: %s", key, error)
    try:
        schema = client.get_collection(collection).payload_schema or {}
    except Exception as error:  # noqa: BLE001
        logger.warning("could not read payload schema for %s: %s", collection, error)
        return
    for key in ("repositoryId", "commitSha"):
        entry = schema.get(key)
        data_type = getattr(entry, "data_type", None)
        if data_type == models.PayloadSchemaType.KEYWORD:
            continue
        if entry is not None:
            logger.warning(
                "payload field %s has index %s, recreating as keyword", key, data_type
            )
            try:
                client.delete_payload_index(
                    collection_name=collection, field_name=key
                )
            except Exception as error:  # noqa: BLE001
                logger.warning("could not drop conflicting index on %s: %s", key, error)
                continue
            try:
                client.create_payload_index(
                    collection_name=collection,
                    field_name=key,
                    field_schema=models.PayloadSchemaType.KEYWORD,
                )
            except Exception as error:  # noqa: BLE001
                logger.warning("could not recreate keyword index on %s: %s", key, error)
        else:
            logger.warning(
                "keyword index on %s still missing after create; deletes will fail", key
            )


def index_chunks(
    client: QdrantClient,
    *,
    collection: str,
    repository_id: str,
    commit_sha: str,
    chunks: list[Chunk],
    settings: Settings | None = None,
    batch_size: int = 64,
) -> int:
    """Embed and upsert chunks. Returns how many were written.

    `settings` is optional: without it there is nothing to embed with, so the
    call is a no-op rather than an error. Callers that want vectors pass a
    Settings resolved from the environment.
    """
    if not chunks or settings is None:
        return 0

    ensure_collection(client, collection, settings.embedding_dimensions)

    written = 0
    for start in range(0, len(chunks), batch_size):
        batch = chunks[start : start + batch_size]
        vectors = embed_batched(batch, settings, batch_size)

        points = [
            models.PointStruct(
                id=point_id(repository_id, chunk),
                vector=vector,
                payload=_payload(repository_id, commit_sha, chunk),
            )
            for chunk, vector in zip(batch, vectors, strict=True)
        ]
        client.upsert(collection_name=collection, points=points, wait=True)
        written += len(points)

    return written


def delete_repository(client: QdrantClient, collection: str, repository_id: str) -> None:
    """Drop every vector for a repository, whatever commit it came from."""
    if not client.collection_exists(collection):
        return
    client.delete(
        collection_name=collection,
        points_selector=models.FilterSelector(
            filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="repositoryId", match=models.MatchValue(value=repository_id)
                    )
                ]
            )
        ),
        wait=True,
    )