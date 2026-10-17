"""Retrieval service: Qdrant vector search + lexical + fusion.

Mirrors packages/retrieval on the TypeScript side. The two must agree on the
fusion rule, so the Reciprocal Rank Fusion constant and its behaviour are
documented identically here rather than tuned independently.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any

from qdrant_client import QdrantClient

from ai_service.config import Settings

logger = logging.getLogger(__name__)

# Matches RRF_K in packages/retrieval/src/types.ts.
RRF_K = 60


@dataclass
class RetrievedChunk:
    repository_id: str
    commit_sha: str
    path: str
    language: str
    symbol: str | None
    kind: str
    start_line: int
    end_line: int
    content: str
    score: float = 0.0
    ranks: dict[str, int] = field(default_factory=dict)


def reciprocal_rank_fusion(
    ranked: dict[str, list[tuple[RetrievedChunk, float]]],
    k: int = RRF_K,
) -> list[RetrievedChunk]:
    """Fuse ranked lists by position rather than by score.

    A cosine similarity and a BM25 score are not on a common scale; combining
    them by value would let whichever happens to produce larger numbers dominate.
    Rank positions are commensurable, so RRF needs no normalisation.
    """
    merged: dict[tuple, RetrievedChunk] = {}

    for retriever, hits in ranked.items():
        for rank, (chunk, _score) in enumerate(hits, start=1):
            key = (
                chunk.repository_id,
                chunk.commit_sha,
                chunk.path,
                chunk.start_line,
                chunk.symbol or "",
            )
            if key in merged:
                existing = merged[key]
                existing.ranks[retriever] = rank
                existing.score += 1 / (k + rank)
                continue

            chunk.ranks = {retriever: rank}
            chunk.score = 1 / (k + rank)
            merged[key] = chunk

    return sorted(merged.values(), key=lambda c: -c.score)


def _from_payload(payload: dict[str, Any]) -> RetrievedChunk:
    return RetrievedChunk(
        repository_id=payload.get("repositoryId", ""),
        commit_sha=payload.get("commitSha", ""),
        path=payload.get("path", ""),
        language=payload.get("language", ""),
        symbol=payload.get("symbol"),
        kind=payload.get("kind", "block"),
        start_line=int(payload.get("startLine", 0)),
        end_line=int(payload.get("endLine", 0)),
        content=payload.get("content", ""),
    )


def vector_search(
    client: QdrantClient,
    collection: str,
    vector: list[float],
    repository_ids: list[str],
    limit: int = 60,
) -> list[tuple[RetrievedChunk, float]]:
    from qdrant_client import models

    if not repository_ids or not client.collection_exists(collection):
        return []

    points = client.query_points(
        collection_name=collection,
        query=vector,
        limit=limit,
        query_filter=models.Filter(
            must=[
                models.FieldCondition(
                    key="repositoryId",
                    match=models.MatchAny(any=repository_ids),
                )
            ]
        ),
        with_payload=True,
    ).points

    return [(_from_payload(p.payload or {}), p.score) for p in points]


def lexical_search(
    chunks_by_repo: dict[str, list[dict[str, Any]]],
    query: str,
    repository_ids: list[str],
    limit: int = 60,
) -> list[tuple[RetrievedChunk, float]]:
    """Naive BM25 over already-indexed chunks.

    The Elasticsearch client lives on the TypeScript side; this keeps the AI
    service self-contained for lexical fallback when it is not reachable.
    """
    terms = [t for t in query.lower().replace("/", " ").split() if len(t) > 1]
    if not terms:
        return []

    documents: list[tuple[dict[str, Any], int, dict[str, int]]] = []
    for repository_id in repository_ids:
        for payload in chunks_by_repo.get(repository_id, []):
            haystack = (
                f"{payload.get('path', '')} {payload.get('symbol') or ''} "
                f"{payload.get('content', '')}"
            ).lower()
            terms_found = {t: haystack.count(t) for t in terms if haystack.count(t) > 0}
            if terms_found:
                documents.append((payload, len(haystack), terms_found))

    if not documents:
        return []

    k1, b = 1.5, 0.75
    avg_length = sum(length for _, length, _ in documents) / len(documents)

    scored: list[tuple[RetrievedChunk, float]] = []
    for payload, length, terms_found in documents:
        score = 0.0
        for term, frequency in terms_found.items():
            containing = sum(1 for _, _, tf in documents if term in tf)
            idf = math.log(1 + (len(documents) - containing + 0.5) / (containing + 0.5))
            norm = frequency * (k1 + 1) / (
                frequency + k1 * (1 - b + (b * length) / avg_length)
            )
            score += idf * norm
        scored.append((_from_payload(payload), score))

    scored.sort(key=lambda item: -item[1])
    return scored[:limit]


def hybrid_retrieve(
    *,
    settings: Settings,
    question: str,
    repository_ids: list[str],
    embedding: list[float],
    client: QdrantClient,
    chunks_by_repo: dict[str, list[dict[str, Any]]] | None = None,
    limit: int = 12,
) -> list[RetrievedChunk]:
    """Vector + lexical, fused, deduplicated, truncated."""
    vector_hits: list[tuple[RetrievedChunk, float]] = []
    try:
        vector_hits = vector_search(
            client,
            settings.qdrant_collection,
            embedding,
            repository_ids,
        )
    except Exception as error:  # noqa: BLE001 - degrade rather than fail the question
        logger.warning("vector search unavailable: %s", error)

    lexical_hits: list[tuple[RetrievedChunk, float]] = []
    if chunks_by_repo:
        try:
            lexical_hits = lexical_search(chunks_by_repo, question, repository_ids)
        except Exception as error:  # noqa: BLE001
            logger.warning("lexical search unavailable: %s", error)

    ranked_lists: dict[str, list[tuple[RetrievedChunk, float]]] = {"vector": vector_hits}
    if lexical_hits:
        ranked_lists["lexical"] = lexical_hits

    fused = reciprocal_rank_fusion(ranked_lists)

    # Collapse overlapping chunks: chunking can emit the same code twice.
    seen: set[tuple] = set()
    deduped: list[RetrievedChunk] = []
    for chunk in fused:
        key = (chunk.repository_id, chunk.path, chunk.start_line)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(chunk)

    return deduped[:limit]