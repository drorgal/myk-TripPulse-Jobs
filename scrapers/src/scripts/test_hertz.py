"""
Manual debug script for the Hertz scraper.

Usage:
    cd scrapers
    source .venv/bin/activate
    PLAYWRIGHT_HEADLESS=false python -m scripts.test_hertz

Runs a real search against hertz.com with fixed params (Amsterdam, 7 days from now),
prints every captured JSON URL, and shows normalized offers at the end.
Screenshots are saved to /tmp/hertz_debug_*.png on any failure.
"""

from __future__ import annotations

import asyncio
import json
import sys
import os
from datetime import datetime, timedelta, timezone

# Allow running from the scrapers/src directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import CarSearchParams
from scrapers.hertz import HertzScraper


def _make_params(
    pickup: str = "Amsterdam Airport Schiphol",
    days_from_now: int = 14,
    rental_days: int = 7,
) -> CarSearchParams:
    now = datetime.now(timezone.utc)
    pickup_dt = now + timedelta(days=days_from_now)
    dropoff_dt = pickup_dt + timedelta(days=rental_days)

    fmt = "%Y-%m-%dT%H:%M:%SZ"
    return CarSearchParams(
        pickup_location=pickup,
        dropoff_location=pickup,
        pickup_datetime=pickup_dt.strftime(fmt),
        dropoff_datetime=dropoff_dt.strftime(fmt),
        currency="EUR",
        driver_age=30,
    )


async def main() -> None:
    params = _make_params()
    save_to_db = os.environ.get("SAVE_DB", "").lower() in ("1", "true", "yes")
    test_job_id = os.environ.get("TEST_JOB_ID", "test-job-local")

    print("=" * 60)
    print("Hertz scraper — debug run")
    print(f"  pickup:   {params.pickup_location}")
    print(f"  from:     {params.pickup_datetime}")
    print(f"  to:       {params.dropoff_datetime}")
    print(f"  headless: {os.environ.get('PLAYWRIGHT_HEADLESS', 'true')}")
    print(f"  save_db:  {save_to_db}")
    print("=" * 60)

    if save_to_db:
        from db import init_pool, save_offers as _save_offers
        init_pool()

    scraper = HertzScraper()

    print("\n[test] checking ping ...")
    ok = await scraper.ping()
    print(f"[test] ping={ok}")
    if not ok:
        print("[test] ping failed — hertz.com unreachable. Aborting.")
        return

    print("\n[test] running search ...")
    offers = await scraper.search(params)

    # Attach a test searchJobId before saving
    for offer in offers:
        offer.search_job_id = test_job_id

    print("\n" + "=" * 60)
    print(f"[test] RESULT: {len(offers)} offers found")
    print("=" * 60)

    if not offers:
        print("[test] No offers. Check /tmp/hertz_debug_*.png for screenshots.")
        return

    for i, offer in enumerate(offers):
        price = offer.price_total / 100
        print(
            f"  [{i+1}] {offer.vehicle_name:<30} "
            f"{offer.vehicle_type:<10} "
            f"{price:.2f} {offer.price_currency}  "
            f"({offer.rental_days}d, {offer.seats_count or '?'} seats, "
            f"{'auto' if offer.is_automatic else 'manual'}, "
            f"{'AC' if offer.has_ac else 'no AC'})"
        )

    print("\n[test] First offer detail:")
    print(json.dumps(offers[0].__dict__, indent=2, default=str))

    if save_to_db:
        saved = _save_offers(offers)
        print(f"\n[test] DB: saved {saved}/{len(offers)} offers (job_id={test_job_id})")


if __name__ == "__main__":
    asyncio.run(main())
