"""FastAPI surface for the AI service.

Deliberately small. Indexing runs on the queue consumer, not over HTTP, so the
API exists for health and observability rather than as a data plane.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from pydantic import BaseModel, Field

from ai_service.bullmq import BullQueue
from ai_service.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger = logging.getLogger("ai_service.api")


def lexical_documents(
    settings, repository_ids: list[str]
) -> dict[str, list[dict[str, object]]]:
    """Fetch indexed chunk documents for the BM25 fallback path.

    Only used when Elasticsearch is unreachable -- vector hits are still real
    results either way, so an empty dict simply means lexical contributes
    nothing to the fusion.
    """
    try:
        from ai_service.storage.lexical import build_client

        client = build_client(settings)
        response = client.search(
            index="code_chunks",
            query={"terms": {"repositoryId": repository_ids}},
            size=400,
            source_includes=[
                "repositoryId",
                "commitSha",
                "path",
                "language",
                "symbol",
                "kind",
                "startLine",
                "endLine",
                "content",
            ],
        )
        grouped: dict[str, list[dict[str, object]]] = {}
        for hit in response["hits"]["hits"]:
            source = hit.get("_source") or {}
            grouped.setdefault(str(source.get("repositoryId", "")), []).append(source)
        return grouped
    except Exception as error:  # noqa: BLE001
        logger.info("lexical documents unavailable: %s", error)
        return {}

app = FastAPI(
    title="NexusRAG AI Service",
    version="0.1.0",
    description="Code parsing, chunking and embeddings for repository snapshots.",
)


@app.get("/health")
def health() -> dict[str, object]:
    """Liveness. Never touches Redis, so a queue outage does not restart the pod."""
    return {"status": "ok", "service": "ai-service", "version": app.version}


@app.get("/ready")
def ready() -> dict[str, object]:
    """Readiness. Reports queue reachability rather than failing hard."""
    settings = get_settings()
    try:
        queue = BullQueue(settings.redis_url, settings.ingestion_queue_name)
        return {"status": "ready", "queue": queue.stats()}
    except Exception as error:  # noqa: BLE001 - surfaced to the caller, not raised
        # Never echo the exception: a Redis connection error carries the host
        # and port, and this endpoint is unauthenticated.
        logger.warning("readiness check failed: %s", error)
        return {"status": "degraded", "reason": "queue unreachable"}


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    repositoryIds: list[str] = Field(default_factory=list, max_length=50)
    limit: int = Field(default=12, ge=1, le=50)


@app.post("/ask")
def ask(request: AskRequest) -> dict[str, object]:
    """Answer a question about indexed repositories.

    Returns a cited answer plus the sources it used, so the user can verify it.
    """
    settings = get_settings()
    repository_ids = request.repositoryIds

    if not repository_ids:
        return {
            "answer": "Select at least one indexed repository to search.",
            "grounded": False,
            "sources": [],
        }

    try:
        from qdrant_client import QdrantClient

        from ai_service.ai import embed
        from ai_service.answering import NoApiKeyError, Source, generate_answer
        from ai_service.retrieval import hybrid_retrieve

        client = QdrantClient(
            url=settings.qdrant_url, api_key=settings.qdrant_api_key, timeout=60
        )

        chunks = hybrid_retrieve(
            settings=settings,
            question=request.question,
            repository_ids=repository_ids,
            embedding=embed([request.question], settings)[0],
            client=client,
            chunks_by_repo=lexical_documents(settings, repository_ids),
            limit=request.limit,
        )

        sources = [
            Source(
                index=i + 1,
                repository_id=c.repository_id,
                path=c.path,
                start_line=c.start_line,
                end_line=c.end_line,
                symbol=c.symbol,
                language=c.language,
            )
            for i, c in enumerate(chunks)
        ]
        payloads = [
            {
                "content": c.content,
                "path": c.path,
                "symbol": c.symbol,
            }
            for c in chunks
        ]

        try:
            answer = generate_answer(request.question, sources, payloads, settings)
        except NoApiKeyError:
            # Retrieval worked; only generation is unavailable. Return the
            # sources so the UI can still show what was found.
            logger.warning("OPENAI_API_KEY is not configured; returning sources only")
            return {
                "answer": (
                    "Retrieved the code below, but answer generation is not "
                    "configured. Set OPENAI_API_KEY to enable answers."
                ),
                "grounded": False,
                "sources": [s.__dict__ for s in sources],
            }

        return {
            "answer": answer.text,
            "grounded": answer.grounded,
            "sources": [s.__dict__ for s in answer.sources],
        }
    except Exception:  # noqa: BLE001
        logger.exception("ask failed")
        return {"error": "Could not answer that question", "grounded": False, "sources": []}