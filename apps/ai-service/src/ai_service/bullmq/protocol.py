"""BullMQ key naming and atomic scripts.

This module is the ONLY place that knows BullMQ's Redis wire format. Everything
else in the service talks to :class:`BullQueue`, so if BullMQ changes its
protocol, or we swap in a different queue, this is the single file to replace.

BullMQ has no official Python client; its worker protocol is a set of lists,
hashes, sorted sets and a stream under ``bull:{queue}:*``. The scripts here
reproduce the transitions a worker needs, atomically, matching what the Node
producer in ``packages/queue`` writes.

Verified against bullmq 5.81.5.
"""

from __future__ import annotations

from dataclasses import dataclass

PREFIX = "bull"


@dataclass(frozen=True)
class QueueKeys:
    """Every Redis key belonging to one queue."""

    queue: str

    @property
    def base(self) -> str:
        return f"{PREFIX}:{self.queue}"

    @property
    def wait(self) -> str:
        return f"{self.base}:wait"

    @property
    def active(self) -> str:
        return f"{self.base}:active"

    @property
    def delayed(self) -> str:
        return f"{self.base}:delayed"

    @property
    def prioritized(self) -> str:
        return f"{self.base}:prioritized"

    @property
    def completed(self) -> str:
        return f"{self.base}:completed"

    @property
    def failed(self) -> str:
        return f"{self.base}:failed"

    @property
    def events(self) -> str:
        return f"{self.base}:events"

    @property
    def meta(self) -> str:
        return f"{self.base}:meta"

    @property
    def stalled(self) -> str:
        return f"{self.base}:stalled"

    def job(self, job_id: str) -> str:
        return f"{self.base}:{job_id}"

    def lock(self, job_id: str) -> str:
        return f"{self.base}:{job_id}:lock"


# Move the next waiting job into the active list, atomically. RPOPLPUSH gives
# FIFO ordering because the producer LPUSHes.
#
# KEYS[1]=wait KEYS[2]=active
# ARGV[1]=lock key KEYS[3]
MOVE_TO_ACTIVE = """
if redis.call('EXISTS', KEYS[1]) == 0 then return nil end
local jobId = redis.call('RPOPLPUSH', KEYS[1], KEYS[2])
if not jobId then return nil end
redis.call('HINCRBY', KEYS[3], 'ats', 1)
return jobId
"""

# Complete a job: drop it from active, stamp it, and move it to the completed
# sorted set.
#
# KEYS[1]=active KEYS[2]=completed KEYS[3]=events KEYS[4]=job hash
# ARGV[1]=jobId ARGV[2]=timestamp ARGV[3]=returnvalue ARGV[4]=maxLenEvents
COMPLETE_JOB = """
redis.call('LREM', KEYS[1], 1, ARGV[1])
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[1])
redis.call('HSET', KEYS[4], 'finishedOn', ARGV[2])
redis.call('HSET', KEYS[4], 'returnvalue', ARGV[3])
redis.call('DEL', KEYS[4] .. ':lock')
redis.call('XADD', KEYS[3], '*', 'event', 'completed', 'jobId', ARGV[1])
return 1
"""

# Record a failure. When attempts remain the job goes back on the delayed set
# with a backoff score; otherwise it lands in the failed set for good.
#
# KEYS[1]=active KEYS[2]=failed KEYS[3]=delayed KEYS[4]=events KEYS[5]=job hash
# KEYS[6]=lock
# ARGV[1]=jobId ARGV[2]=timestamp ARGV[3]=reason ARGV[4]=stacktrace
# ARGV[5]=shouldRetry(0/1) ARGV[6]=runAt
#
# `atm` (attempts made) must be INCREMENTED, not overwritten: it is what bounds
# the retry loop, and setting it to the pre-failure value would never terminate.
FAIL_JOB = """
redis.call('LREM', KEYS[1], 1, ARGV[1])
redis.call('HINCRBY', KEYS[5], 'atm', 1)
redis.call('HSET', KEYS[5], 'failedReason', ARGV[3])
redis.call('HSET', KEYS[5], 'finishedOn', ARGV[2])
redis.call('HSET', KEYS[5], 'stacktrace', ARGV[4])
redis.call('DEL', KEYS[6])

if ARGV[5] == '1' then
  redis.call('ZADD', KEYS[3], ARGV[6], ARGV[1])
  redis.call('XADD', KEYS[4], '*', 'event', 'delayed', 'jobId', ARGV[1])
else
  redis.call('ZADD', KEYS[2], ARGV[2], ARGV[1])
  redis.call('XADD', KEYS[4], '*', 'event', 'failed', 'jobId', ARGV[1], 'failedReason', ARGV[3])
end
return 1
"""

# Promote any delayed jobs whose time has come into the waiting list.
# Mirrors what BullMQ does before fetching, so retries fire without the
# producer having to re-add them.
#
# KEYS[1]=delayed KEYS[2]=wait KEYS[3]=events
# ARGV[1]=now ARGV[2]=limit
PROMOTE_DELAYED = """
local moved = 0
local ids = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, ARGV[2])
for _, jobId in ipairs(ids) do
  if redis.call('ZREM', KEYS[1], jobId) == 1 then
    redis.call('LPUSH', KEYS[2], jobId)
    redis.call('XADD', KEYS[3], '*', 'event', 'waiting', 'jobId', jobId)
    moved = moved + 1
  end
end
return moved
"""