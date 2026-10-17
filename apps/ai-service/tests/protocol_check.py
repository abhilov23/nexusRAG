"""Cross-language check: Node enqueues, Python consumes.

Proves the protocol module actually agrees with the real BullMQ producer
instead of only agreeing with itself.

Runs two scenarios:
  1. success  -- reserve, complete
  2. failure  -- fail with retries left, confirm delayed + backoff promotion
"""

from __future__ import annotations

import os
import pathlib
import re
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))

from ai_service.bullmq import BullQueue  # noqa: E402

ENV = pathlib.Path(__file__).resolve().parents[3] / ".env"
QUEUE = os.environ.get("TEST_QUEUE", "ai-service-protocol-test")


def redis_url() -> str:
    match = re.search(r"^REDIS_URL=(.*)$", ENV.read_text(encoding="utf-8"), re.M)
    return match.group(1).strip().strip('"') if match else "redis://localhost:6379"


def check_success(queue: BullQueue, job_id: str) -> bool:
    print("\n--- scenario 1: success ---")
    print("before:", queue.stats())

    job = queue._reserve()
    if job is None:
        print("FAIL: no job reserved")
        return False

    print(f"reserved id={job.id[:24]}... name={job.name} attempts={job.attempts_made}")
    print("  data:", job.data)

    if not (
        job.id == job_id
        and job.name == "ingest"
        and job.data.get("owner") == "probe"
        and job.data.get("repo") == "protocol-check"
        and job.max_attempts == 3
        and job.backoff_ms() == 5000
    ):
        print("FAIL: payload did not round-trip")
        return False

    print("during:", queue.stats())
    queue.complete(job)
    after = queue.stats()
    print("after :", after)

    if after["active"] != 0 or after["completed"] != 1:
        print("FAIL: completion bookkeeping wrong")
        return False
    print("PASS: success path")
    return True


def promote_now(queue: BullQueue, job_id: str) -> None:
    """Make a delayed job due immediately, skipping the real backoff wait."""
    queue.redis.zadd(queue.keys.delayed, {job_id: int(time.time() * 1000) - 1})


def check_failure(queue: BullQueue, job_id: str) -> bool:
    print("\n--- scenario 2: failure with retry ---")
    print("before:", queue.stats())

    job = queue._reserve()
    if job is None:
        print("FAIL: no job reserved")
        return False

    attempts_before = job.attempts_made
    print(f"reserved id={job.id[:24]}... attempts={attempts_before} max={job.max_attempts}")

    queue.fail(job, RuntimeError("synthetic failure for the protocol check"))

    after = queue.stats()
    print("after fail:", after)

    # attempts=1 of 3 means it must be waiting to retry, not dead.
    if after["delayed"] != 1 or after["failed"] != 0:
        print("FAIL: job with retries left should land in delayed, not failed")
        return False

    # The delayed score must be in the future by the backoff amount.
    score = queue.redis.zscore(queue.keys.delayed, job.id)
    now = int(time.time() * 1000)
    print(f"  delayed score is {score - now:+.0f}ms from now (backoff={job.backoff_ms()}ms)")
    if score is None or score <= now:
        print("FAIL: delayed job is not scheduled in the future")
        return False

    # Walk the job through the rest of its attempts, forcing each backoff to be
    # due rather than sleeping through it.
    seen = [attempts_before]
    for attempt in range(2, job.max_attempts + 1):
        promote_now(queue, job_id)
        current = queue._reserve()
        if current is None:
            print(f"FAIL: lost the job on attempt {attempt}")
            return False
        if current.id != job.id:
            print("FAIL: promoted a different job")
            return False
        if current.attempts_made <= seen[-1]:
            print(
                f"FAIL: attempt counter stuck at {current.attempts_made} "
                "-- infinite retry loop"
            )
            return False
        seen.append(current.attempts_made)
        print(
            f"  attempt {attempt}: attempts_made={current.attempts_made} "
            f"retry={current.will_retry}"
        )
        queue.fail(current, RuntimeError(f"synthetic failure {attempt}"))

    final = queue.stats()
    print("after exhausting retries:", final)
    print(f"  attempts_made progression: {seen}")

    if final["failed"] != 1 or final["delayed"] != 0 or final["active"] != 0:
        print("FAIL: exhausted job should be terminally failed and fully drained")
        return False

    print("PASS: failure path, retry, backoff promotion, terminal failure")
    return True


def reenqueue() -> None:
    """Re-add the job with the Node producer for the next scenario."""
    here = pathlib.Path(__file__).resolve().parents[1]
    probe = here.parent / "worker" / "test" / "enqueue_probe.mjs"
    result = os.system(f'node "{probe}"')
    if result != 0:
        raise RuntimeError("node enqueue probe failed")


def main() -> int:
    queue = BullQueue(redis_url(), QUEUE)
    job_id = os.environ["TEST_JOB_ID"]

    ok = check_success(queue, job_id)
    if ok:
        reenqueue()
        ok = check_failure(queue, job_id)

    print("\nPASS: Node -> Redis -> Python round-trip" if ok else "\nFAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())