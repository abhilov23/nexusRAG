"""FastAPI surface for the AI service.

Deliberately small. Indexing runs on the queue consumer, not over HTTP, so the
API exists for health, answering and retrieval observability rather than as a
data plane.
"""

from __future__ import annotations

import logging
import time

from fastapi import FastAPI, HTTPException
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


class JudgeRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(min_length=1, max_length=40_000)
    context: str = Field(default="", max_length=200_000)


def _source_payload(source) -> dict[str, object]:
    return {
        "index": source.index,
        "repository_id": source.repository_id,
        "path": source.path,
        "start_line": source.start_line,
        "end_line": source.end_line,
        "symbol": source.symbol,
        "language": source.language,
    }


def _chunk_payload(index: int, chunk) -> dict[str, object]:
    return {
        "index": index,
        "repository_id": chunk.repository_id,
        "path": chunk.path,
        "language": chunk.language,
        "symbol": chunk.symbol,
        "kind": chunk.kind,
        "start_line": chunk.start_line,
        "end_line": chunk.end_line,
        "score": round(float(chunk.score), 6),
        "ranks": dict(chunk.ranks),
        "content": chunk.content,
    }


def _retrieval_payload(outcome, chunks) -> dict[str, object]:
    return {
        "vector_hits": outcome.vector_hits,
        "lexical_hits": outcome.lexical_hits,
        "fused": outcome.fused,
        "deduped": outcome.deduped,
        "returned": len(chunks),
        "vector_ms": outcome.vector_ms,
        "lexical_ms": outcome.lexical_ms,
        "fusion_ms": outcome.fusion_ms,
        "chunks": [_chunk_payload(i + 1, chunk) for i, chunk in enumerate(chunks)],
    }


def _tokens(prompt_tokens: int, completion_tokens: int) -> dict[str, int]:
    return {
        "prompt": prompt_tokens,
        "completion": completion_tokens,
        "total": prompt_tokens + completion_tokens,
    }


@app.post("/ask")
def ask(request: AskRequest) -> dict[str, object]:
    """Answer a question about indexed repositories.

    Returns a cited answer plus a full trace: retrieval counters, ranked chunks,
    the exact context sent to the model, timings, token usage and estimated cost.
    """
    settings = get_settings()
    started = time.perf_counter()
    repository_ids = request.repositoryIds

    if not repository_ids:
        return {
            "answer": "Select at least one indexed repository to search.",
            "grounded": False,
            "sources": [],
            "model": "",
            "tokens": _tokens(0, 0),
            "cost_usd": 0.0,
            "timings": {
                "embed_ms": 0.0,
                "retrieval_ms": 0.0,
                "generation_ms": 0.0,
                "total_ms": 0.0,
            },
            "retrieval": {
                "vector_hits": 0,
                "lexical_hits": 0,
                "fused": 0,
                "deduped": 0,
                "returned": 0,
                "vector_ms": 0.0,
                "lexical_ms": 0.0,
                "fusion_ms": 0.0,
                "chunks": [],
            },
            "context": "",
        }

    try:
        from qdrant_client import QdrantClient

        from ai_service.ai import embed
        from ai_service.answering import (
            NoApiKeyError,
            Source,
            build_prompt,
            generate_answer,
        )
        from ai_service.retrieval import hybrid_retrieve_with_stats

        client = QdrantClient(
            url=settings.qdrant_url, api_key=settings.qdrant_api_key, timeout=60
        )

        embed_started = time.perf_counter()
        embedding = embed([request.question], settings)[0]
        embed_ms = (time.perf_counter() - embed_started) * 1000

        retrieval_started = time.perf_counter()
        outcome = hybrid_retrieve_with_stats(
            settings=settings,
            question=request.question,
            repository_ids=repository_ids,
            embedding=embedding,
            client=client,
            chunks_by_repo=lexical_documents(settings, repository_ids),
            limit=request.limit,
        )
        retrieval_ms = (time.perf_counter() - retrieval_started) * 1000
        chunks = outcome.chunks

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
        context = build_prompt(request.question, sources, payloads)
        retrieval = _retrieval_payload(outcome, chunks)

        generation_started = time.perf_counter()
        try:
            answer = generate_answer(request.question, sources, payloads, settings)
        except NoApiKeyError:
            # Retrieval worked; only generation is unavailable. Return the
            # sources and trace so the UI can still show what was found.
            logger.warning("OPENAI_API_KEY is not configured; returning sources only")
            total_ms = (time.perf_counter() - started) * 1000
            return {
                "answer": (
                    "Retrieved the code below, but answer generation is not "
                    "configured. Set OPENAI_API_KEY to enable answers."
                ),
                "grounded": False,
                "sources": [_source_payload(source) for source in sources],
                "model": "",
                "tokens": _tokens(0, 0),
                "cost_usd": 0.0,
                "timings": {
                    "embed_ms": round(embed_ms, 2),
                    "retrieval_ms": round(retrieval_ms, 2),
                    "generation_ms": 0.0,
                    "total_ms": round(total_ms, 2),
                },
                "retrieval": retrieval,
                "context": context,
            }
        generation_ms = (time.perf_counter() - generation_started) * 1000
        total_ms = (time.perf_counter() - started) * 1000

        tokens = _tokens(answer.prompt_tokens, answer.completion_tokens)
        cost = settings.estimate_llm_cost(
            answer.prompt_tokens, answer.completion_tokens
        )

        return {
            "answer": answer.text,
            "grounded": answer.grounded,
            "sources": [_source_payload(source) for source in answer.sources],
            "model": answer.model,
            "tokens": tokens,
            "cost_usd": round(cost, 8),
            "timings": {
                "embed_ms": round(embed_ms, 2),
                "retrieval_ms": round(retrieval_ms, 2),
                "generation_ms": round(generation_ms, 2),
                "total_ms": round(total_ms, 2),
            },
            "retrieval": retrieval,
            "context": context,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("ask failed")
        raise HTTPException(status_code=500, detail="Could not answer that question") from exc


@app.post("/judge")
def judge(request: JudgeRequest) -> dict[str, object]:
    """Score an answer's faithfulness and relevance with the configured model.

    This is explicitly a model judgement. It powers the answer-quality card in
    the evaluations dashboard, never the retrieval precision metrics.
    """
    settings = get_settings()

    try:
        from ai_service.answering import NoApiKeyError, judge_answer

        result = judge_answer(
            question=request.question,
            answer=request.answer,
            context=request.context,
            settings=settings,
        )
    except NoApiKeyError:
        raise HTTPException(
            status_code=503, detail="Answer judging is not configured"
        ) from None
    except Exception:  # noqa: BLE001
        logger.exception("judge failed")
        raise HTTPException(
            status_code=502, detail="Could not judge that answer"
        ) from None

    return {
        "faithfulness": round(result.faithfulness, 4),
        "relevance": round(result.relevance, 4),
        "rationale": result.rationale,
        "tokens": _tokens(result.prompt_tokens, result.completion_tokens),
    }
