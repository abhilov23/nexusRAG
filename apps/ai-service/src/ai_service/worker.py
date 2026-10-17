"""Queue consumer entrypoint.

Runs the parse -> chunk -> embed -> index stage for every ingestion job the
TypeScript side enqueues.
"""

from __future__ import annotations

import json
import logging
import signal
import sys
import time
import urllib.request

from qdrant_client import QdrantClient

from ai_service.bullmq import BullQueue, Job
from ai_service.config import get_settings
from ai_service.pipeline import build_subgraph, index_graph, index_repository
from ai_service.storage import iter_archive_files

logger = logging.getLogger("ai_service.worker")

_stop = False


def _request_stop(signum: int, _frame: object) -> None:
    global _stop
    logger.info("signal %s received, finishing current job then exiting", signum)
    _stop = True


def process_job(job: Job, *, settings, client) -> None:
    """Handle one ingestion job."""
    repository_id = job.data["repositoryId"]
    commit_sha = job.data["commitSha"]
    storage_key = job.data.get("storageKey")

    if not storage_key:
        # The TypeScript worker derives the key deterministically; accept either
        # an explicit key or reconstruct it from the same rule.
        storage_key = (
            f"repositories/{job.data['userId']}/{repository_id}/{commit_sha}.tar.gz"
        )

    logger.info("[ingest] indexing %s at %s", repository_id, commit_sha[:12])

    files = [
        (source.path, source.data)
        for source in iter_archive_files(settings, storage_key)
    ]

    result = index_repository(
        client=client,
        collection=settings.qdrant_collection,
        repository_id=repository_id,
        commit_sha=commit_sha,
        files=files,
        settings=settings,
        batch_size=settings.embedding_batch_size,
    )

    # Graph last: it is the most optional of the three stores, and a failure
    # here should not cost the repository its vector and lexical indexes.
    if settings.neo4j_uri:
        index_graph(
            settings=settings,
            build=build_subgraph(
                repository_id=repository_id, commit_sha=commit_sha, files=files
            ),
            repository_id=repository_id,
            result=result,
        )

    logger.info("[ingest] %s: %s", repository_id, result.summary())
    if result.errors:
        logger.warning("[ingest] %s partial: %s", repository_id, "; ".join(result.errors))

    report_completion(
        settings,
        repository_id=repository_id,
        commit_sha=commit_sha,
        ok=True,
        language=result.primary_language,
    )


def report_completion(settings, *, repository_id: str, commit_sha: str, ok: bool,
                       language: str | None = None, error: str | None = None) -> None:
    """Tell the web app the indexing stage finished (or terminally failed).

    Without this the repository would sit in INDEXING forever: the web app
    marks READY only on this callback, never on archive upload. Best-effort --
    a failed callback is logged, and the row keeps its in-flight status so a
    retry or re-index can still complete it. Skipped entirely when no secret
    is configured.
    """
    secret = settings.internal_api_key
    if not secret:
        logger.warning("[ingest] INTERNAL_API_KEY unset, skipping completion callback")
        return
    payload = {
        "repositoryId": repository_id,
        "commitSha": commit_sha,
        "ok": ok,
        "language": language,
        "error": error,
    }
    request = urllib.request.Request(
        f"{settings.web_base_url.rstrip('/')}/api/internal/indexing-complete",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {secret}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            logger.info("[ingest] completion callback %s for %s", response.status, repository_id)
    except Exception as exc:  # noqa: BLE001 - callback must never fail the job
        logger.warning("[ingest] completion callback failed for %s: %s", repository_id, exc)


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    signal.signal(signal.SIGINT, _request_stop)
    signal.signal(signal.SIGTERM, _request_stop)

    settings = get_settings()
    queue = BullQueue(settings.redis_url, settings.queue_name)
    # Cloud Qdrant is slow on big upserts; the client default (5s) kills
    # large batches mid-write and the job burns all attempts timing out.
    client = QdrantClient(
        url=settings.qdrant_url, api_key=settings.qdrant_api_key, timeout=120
    )

    logger.info(
        "ai-service worker started (queue=%s, embeddings=%s)",
        settings.queue_name,
        settings.embedding_model,
    )

    reserve_failures = 0
    while not _stop:
        try:
            job = queue._reserve()
        except Exception as error:  # noqa: BLE001 - a Redis blip must not kill the worker
            reserve_failures += 1
            backoff = min(5 * reserve_failures, 60)
            logger.warning("queue reserve failed (%s), retrying in %ss", error, backoff)
            time.sleep(backoff)
            continue
        reserve_failures = 0
        if job is None:
            time.sleep(0.05)
            continue
        try:
            process_job(job, settings=settings, client=client)
        except BaseException as error:  # noqa: BLE001 - a bad job must not kill the worker
            logger.exception("job %s failed", job.id)
            queue.fail(job, error)
            if not job.will_retry:
                data = job.data if isinstance(job.data, dict) else {}
                report_completion(
                    settings,
                    repository_id=str(data.get("repositoryId", "")),
                    commit_sha=str(data.get("commitSha", "")),
                    ok=False,
                    error=f"{type(error).__name__}: {error}"[:2000],
                )
        else:
            queue.complete(job)

    logger.info("ai-service worker stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())