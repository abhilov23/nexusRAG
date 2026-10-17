"""Lexical index over code chunks.

Elasticsearch is the production backend for exact-identifier search. Embeddings
find code that *means* something similar; only lexical search reliably matches a
developer typing ``validateAccessToken``.

Everything degrades to a no-op when Elasticsearch is unreachable, because the
vector index alone is still a working -- if weaker -- retrieval path.
"""

from __future__ import annotations

import logging
from typing import Any

from ai_service.config import Settings
from ai_service.parsing import Chunk

logger = logging.getLogger(__name__)

INDEX_NAME = "code_chunks"

# Mirrors CODE_CHUNKS_MAPPING in packages/search/src/client.ts. Both sides
# must agree or a query written for one will silently mis-score against the other.
INDEX_SETTINGS: dict[str, Any] = {
    "settings": {
        "analysis": {
            "analyzer": {
                "code_analyzer": {
                    "type": "custom",
                    "tokenizer": "standard",
                    "filter": ["lowercase", "asciifolding"],
                }
            },
            "filter": {
                # Splits camelCase and snake_case, so `getUserById` is also
                # findable as "user".
                "code_shingles": {
                    "type": "word_delimiter_graph",
                    "generate_word_parts": True,
                    "generate_number_parts": True,
                    "catenate_words": True,
                    "catenate_numbers": True,
                    "split_on_case_change": True,
                }
            },
        }
    },
    "mappings": {
        "properties": {
            "repositoryId": {"type": "keyword"},
            "commitSha": {"type": "keyword"},
            "path": {
                "type": "text",
                "analyzer": "code_analyzer",
                "fields": {"keyword": {"type": "keyword"}},
            },
            "language": {"type": "keyword"},
            "symbol": {
                "type": "text",
                "analyzer": "code_analyzer",
                "fields": {"keyword": {"type": "keyword"}},
            },
            "kind": {"type": "keyword"},
            "startLine": {"type": "integer"},
            "endLine": {"type": "integer"},
            "imports": {"type": "text", "analyzer": "code_analyzer"},
            "content": {"type": "text", "analyzer": "code_analyzer"},
        }
    },
}


def build_client(settings: Settings):
    """Construct the Elasticsearch client.

    The 9.x client takes explicit credential kwargs (`api_key`, `basic_auth`)
    rather than the 8.x catch-all `auth=` mapping.

    Raises when no URL is configured, so callers can skip lexical indexing
    instead of waiting on a connection that will never succeed.
    """
    from elasticsearch import Elasticsearch

    if not settings.elasticsearch_url:
        raise RuntimeError("ELASTICSEARCH_URL is not configured")

    api_key = settings.elasticsearch_api_key
    username = settings.elasticsearch_username
    password = settings.elasticsearch_password

    credentials: dict[str, Any] = {}
    if api_key:
        credentials["api_key"] = api_key
    elif username and password:
        credentials["basic_auth"] = (username, password)

    return Elasticsearch(
        settings.elasticsearch_url,
        **credentials,
        # Fail fast. Lexical indexing is optional, so retrying for a minute on a
        # cluster that is simply absent would stall the whole indexing job.
        request_timeout=10,
        retry_on_timeout=False,
        max_retries=1,
    )


def ensure_index(client, index: str = INDEX_NAME) -> bool:
    """Create the index if absent. Returns False when unavailable."""
    try:
        if client.indices.exists(index=index):
            return True
        client.indices.create(index=index, **INDEX_SETTINGS)
        return True
    except Exception as error:  # noqa: BLE001
        logger.warning("could not ensure Elasticsearch index: %s", error)
        return False


def document_id(repository_id: str, chunk: Chunk) -> str:
    """Stable id so re-indexing replaces rather than duplicates."""
    return f"{repository_id}:{chunk.path}:{chunk.start_line}:{chunk.symbol or 'file'}"


def index_chunks(
    client,
    chunks: list[Chunk],
    repository_id: str,
    commit_sha: str,
    *,
    index: str = INDEX_NAME,
    batch_size: int = 500,
) -> int:
    """Index chunks. Returns how many were written; 0 means degraded."""
    if not chunks:
        return 0

    try:
        ensure_index(client, index)
        written = 0
        for start in range(0, len(chunks), batch_size):
            batch = chunks[start : start + batch_size]
            operations: list[dict[str, Any]] = []
            for chunk in batch:
                operations.append(
                    {"index": {"_index": index, "_id": document_id(repository_id, chunk)}}
                )
                operations.append(
                    {
                        "repositoryId": repository_id,
                        "commitSha": commit_sha,
                        "path": chunk.path,
                        "language": chunk.language,
                        "symbol": chunk.symbol,
                        "kind": chunk.kind,
                        "startLine": chunk.start_line,
                        "endLine": chunk.end_line,
                        "imports": list(chunk.imports),
                        "content": chunk.content,
                    }
                )
            response = client.bulk(operations=operations, refresh=True)
            if response.get("errors"):
                # Count the failures rather than failing the whole batch: one
                # malformed document should not abandon the repository.
                failed = sum(
                    1
                    for item in response.get("items", [])
                    if item.get("index", {}).get("error")
                )
                logger.warning("Elasticsearch bulk had %d failed items", failed)
            written += len(batch)
        return written
    except Exception as error:  # noqa: BLE001
        logger.warning("lexical indexing unavailable: %s", error)
        return 0


def delete_repository(client, repository_id: str, *, index: str = INDEX_NAME) -> None:
    """Remove every document for a repository before re-indexing it."""
    try:
        client.delete_by_query(
            index=index,
            query={"term": {"repositoryId": repository_id}},
            refresh=True,
            conflicts="proceed",
        )
    except Exception as error:  # noqa: BLE001
        logger.warning("could not clear Elasticsearch documents: %s", error)