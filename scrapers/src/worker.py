from __future__ import annotations

"""
BullMQ-compatible Redis consumer for the car-scrape queue.

BullMQ stores jobs using these Redis keys (v5 format):
  bull:{queue}:wait        — list (LPUSH), job_id values
  bull:{queue}:{id}        — hash with fields: data, name, opts, timestamp, ...
  bull:{queue}:active      — sorted set of jobs being processed
  bull:{queue}:completed   — sorted set of finished jobs
  bull:{queue}:failed      — sorted set of failed jobs

We use BRPOP on the wait list to atomically dequeue one job at a time.
"""

import asyncio
import json
import os
import time
import redis as redis_module
from typing import Awaitable, Callable

from logger import get_logger
from models import CarSearchParams

log = get_logger("worker")

QUEUE_NAME = "car-scrape"
BULL_PREFIX = "bull"


def _redis_client() -> redis_module.Redis:
    return redis_module.Redis(
        host=os.environ.get("REDIS_HOST", "localhost"),
        port=int(os.environ.get("REDIS_PORT", "6379")),
        password=os.environ.get("REDIS_PASSWORD", "localdev"),
        decode_responses=True,
    )


def _wait_key() -> str:
    return f"{BULL_PREFIX}:{QUEUE_NAME}:wait"


def _job_key(job_id: str) -> str:
    return f"{BULL_PREFIX}:{QUEUE_NAME}:{job_id}"


def _active_key() -> str:
    return f"{BULL_PREFIX}:{QUEUE_NAME}:active"


def _completed_key() -> str:
    return f"{BULL_PREFIX}:{QUEUE_NAME}:completed"


def _failed_key() -> str:
    return f"{BULL_PREFIX}:{QUEUE_NAME}:failed"


def _parse_payload(raw_data: str) -> tuple[str, CarSearchParams, list[str] | None]:
    """Parse BullMQ job data JSON into typed objects."""
    payload = json.loads(raw_data)
    params_raw = payload["params"]
    params = CarSearchParams(
        pickup_location=params_raw["pickupLocation"],
        dropoff_location=params_raw["dropoffLocation"],
        pickup_datetime=params_raw["pickupDateTime"],
        dropoff_datetime=params_raw["dropoffDateTime"],
        currency=params_raw.get("currency", "USD"),
        driver_age=params_raw.get("driverAge", 30),
    )
    return payload["searchJobId"], params, payload.get("scrapers")


Handler = Callable[[str, CarSearchParams, list[str] | None], Awaitable[None]]


def run_worker(handler: Handler) -> None:
    """
    Blocking loop that pops jobs from the BullMQ wait queue and processes them.
    Each job is processed one at a time; set SCRAPER_CONCURRENCY > 1 in main.py
    to run multiple worker processes instead of using async concurrency here
    (Playwright works better with separate processes).
    """
    r = _redis_client()
    log.info("worker_started", queue=QUEUE_NAME)

    while True:
        # BullMQ v4+ stores the wait queue as a LIST — use BRPOP, not BZPOPMIN.
        result = r.brpop(_wait_key(), timeout=5)

        if result is None:
            continue

        _, job_id = result  # (key, member)
        job_key = _job_key(job_id)
        job_data = r.hget(job_key, "data")

        if job_data is None:
            log.warning("job_data_missing", job_id=job_id)
            continue

        # Move to active set
        r.zadd(_active_key(), {job_id: time.time()})

        try:
            search_job_id, params, scrapers = _parse_payload(job_data)
            log.info("job_started", job_id=job_id, search_job_id=search_job_id)

            asyncio.run(handler(search_job_id, params, scrapers))

            # Mark completed — store for 24h (same as Node.js side)
            r.zrem(_active_key(), job_id)
            r.zadd(_completed_key(), {job_id: time.time()})
            r.hset(job_key, "returnvalue", "null")
            r.hset(job_key, "finishedOn", str(int(time.time() * 1000)))

            log.info("job_completed", job_id=job_id, search_job_id=search_job_id)

        except Exception as exc:
            attempts_made = int(r.hget(job_key, "attemptsMade") or "0") + 1
            max_attempts = int(json.loads(r.hget(job_key, "opts") or "{}").get("attempts", 2))

            r.hset(job_key, "attemptsMade", str(attempts_made))
            r.hset(job_key, "failedReason", str(exc))
            r.zrem(_active_key(), job_id)

            if attempts_made < max_attempts:
                delay = 5000 * (2 ** (attempts_made - 1))  # exponential backoff
                retry_at = time.time() + delay / 1000
                r.zadd(f"{BULL_PREFIX}:{QUEUE_NAME}:delayed", {job_id: retry_at * 1000})
                log.warning("job_retrying", job_id=job_id, attempt=attempts_made, delay_ms=delay, error=str(exc))
            else:
                r.zadd(_failed_key(), {job_id: time.time()})
                log.error("job_failed", job_id=job_id, attempts=attempts_made, error=str(exc))
