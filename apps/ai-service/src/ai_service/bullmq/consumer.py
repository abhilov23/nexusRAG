"""A minimal BullMQ worker, in Python.

Consumes the same Redis queue the TypeScript producer writes to. See
:mod:`ai_service.bullmq.protocol` for the wire-format caveat.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import redis

from .protocol import (
    COMPLETE_JOB,
    FAIL_JOB,
    MOVE_TO_ACTIVE,
    PROMOTE_DELAYED,
    QueueKeys,
)

logger = logging.getLogger(__name__)

# BullMQ's own default is 30s. Jobs here stream large archives, so a shorter
# lock would let a second worker steal and duplicate in-flight work.
DEFAULT_LOCK_MS = 120_000


@dataclass
class Job:
    id: str
    name: str
    data: dict[str, Any]
    attempts_made: int
    opts: dict[str, Any]

    @property
    def max_attempts(self) -> int:
        return int(self.opts.get("attempts", 1) or 1)

    @property
    def will_retry(self) -> bool:
        """True when this attempt should be rescheduled.

        `attempts` counts *total* attempts, so the job retries while the attempt
        being made right now plus the pending one is still under the limit.
        """
        return self.attempts_made + 1 < self.max_attempts

    def backoff_ms(self) -> int:
        """Exponential backoff, matching BullMQ's `type: "exponential"`."""
        backoff = self.opts.get("backoff") or {}
        if backoff.get("type") != "exponential":
            return int(backoff.get("delay", 0) or 0)
        base = int(backoff.get("delay", 1000) or 1000)
        # BullMQ counts the *completed* attempt as the first.
        return base * (2 ** max(self.attempts_made - 1, 0))


Handler = Callable[[Job], None]


class BullQueue:
    """Worker-side view of a BullMQ queue."""

    def __init__(
        self,
        redis_url: str,
        queue_name: str,
        *,
        lock_ms: int = DEFAULT_LOCK_MS,
        blocked_ms: int = 2_000,
    ) -> None:
        self.keys = QueueKeys(queue_name)
        self.lock_ms = lock_ms
        self.blocked_ms = blocked_ms
        # Managed Redis endpoints (Upstash and friends) close idle
        # connections aggressively. Without keepalive + retries a single
        # RST between polls kills the whole worker process, and every
        # in-flight repository then sits in INDEXING forever.
        self.redis = redis.Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_keepalive=True,
            socket_connect_timeout=10,
            socket_timeout=10,
            retry_on_timeout=True,
            health_check_interval=30,
        )

        self._move_to_active = self.redis.register_script(MOVE_TO_ACTIVE)
        self._promote_delayed = self.redis.register_script(PROMOTE_DELAYED)

    # --- reading ------------------------------------------------------------

    def stats(self) -> dict[str, int]:
        r = self.redis
        return {
            "waiting": r.llen(self.keys.wait),
            "active": r.llen(self.keys.active),
            "delayed": r.zcard(self.keys.delayed),
            "completed": r.zcard(self.keys.completed),
            "failed": r.zcard(self.keys.failed),
        }

    def _load(self, job_id: str) -> Job | None:
        raw = self.redis.hgetall(self.keys.job(job_id))
        if not raw:
            return None
        try:
            data = json.loads(raw.get("data") or "{}")
        except json.JSONDecodeError:
            logger.error("job %s has unparseable data, skipping", job_id)
            return None
        try:
            opts = json.loads(raw.get("opts") or "{}")
        except json.JSONDecodeError:
            opts = {}
        return Job(
            id=job_id,
            name=raw.get("name", "default"),
            data=data,
            attempts_made=int(raw.get("atm") or 0),
            opts=opts,
        )

    def _reserve(self) -> Job | None:
        """Take the next runnable job, or None if nothing is ready."""
        self._promote_delayed(
            keys=[self.keys.delayed, self.keys.wait, self.keys.events],
            args=[int(time.time() * 1000), 100],
        )

        job_id = self._move_to_active(
            keys=[self.keys.wait, self.keys.active, self.keys.job("")],
            args=[],
        )
        if job_id is None:
            return None

        job = self._load(job_id)
        if job is None:
            # The hash is gone (trimmed away). Don't leave it stuck in active.
            self.redis.lrem(self.keys.active, 1, job_id)
            return None

        # Hold the lock so a stalled-checker elsewhere does not consider it free.
        self.redis.set(self.keys.lock(job_id), "1", px=self.lock_ms)
        return job

    # --- writing ------------------------------------------------------------

    def complete(self, job: Job) -> None:
        self.redis.eval(
            COMPLETE_JOB,
            4,
            self.keys.active,
            self.keys.completed,
            self.keys.events,
            self.keys.job(job.id),
            job.id,
            int(time.time() * 1000),
            "OK",
        )

    def fail(self, job: Job, error: BaseException) -> None:
        now = int(time.time() * 1000)
        should_retry = job.will_retry
        run_at = now + job.backoff_ms() if should_retry else now

        self.redis.eval(
            FAIL_JOB,
            6,
            self.keys.active,
            self.keys.failed,
            self.keys.delayed,
            self.keys.events,
            self.keys.job(job.id),
            self.keys.lock(job.id),
            job.id,
            now,
            str(error)[:500],
            (f"{type(error).__name__}: {error}")[:2000],
            "1" if should_retry else "0",
            run_at,
        )

    # --- consuming ----------------------------------------------------------

    def run_forever(self, handler: Handler, *, max_jobs: int | None = None) -> None:
        """Process jobs until stopped, or until `max_jobs` have been handled."""
        handled = 0
        logger.info("consuming queue %r", self.keys.queue)

        while max_jobs is None or handled < max_jobs:
            try:
                job = self._reserve()
            except Exception as error:  # noqa: BLE001 - a Redis blip must not kill the consumer
                logger.warning("queue reserve failed (%s), retrying", error)
                time.sleep(5)
                continue
            if job is None:
                continue
            try:
                handler(job)
            except BaseException as error:  # noqa: BLE001 - a bad job must not kill the worker
                logger.exception("job %s failed", job.id)
                self.fail(job, error)
            else:
                self.complete(job)
            handled += 1