import asyncio, sys
sys.path.insert(0, "src")

from dotenv import load_dotenv
load_dotenv(".env")

import json
from logger import setup_logging
from models import CarSearchParams
from scrapers.hertz import HertzScraper
from db import init_pool, save_offers, get_conn

setup_logging()

DEBUG_JOB_ID = "debug-hertz-run"

def ensure_debug_search_job(params: CarSearchParams) -> None:
    """Upsert a SearchJob row so the FK constraint on CarOffer is satisfied."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO "SearchJob" (id, status, params, "createdAt", "updatedAt")
            VALUES (%s, 'COMPLETED', %s, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
            """,
            (
                DEBUG_JOB_ID,
                json.dumps({
                    "pickupLocation": params.pickup_location,
                    "dropoffLocation": params.dropoff_location,
                    "pickupDateTime": params.pickup_datetime,
                    "dropoffDateTime": params.dropoff_datetime,
                    "currency": params.currency,
                }),
            ),
        )
        cur.close()

async def main():
    init_pool()

    scraper = HertzScraper()

    params = CarSearchParams(
        pickup_location="Vienna Airport",
        dropoff_location="Vienna Airport",
        pickup_datetime="2026-07-01T10:00:00Z",
        dropoff_datetime="2026-07-08T10:00:00Z",
        currency="EUR",
        driver_age=30,
    )

    print("Running Hertz scraper...")
    offers = await scraper.search(params)
    print(f"\nFound {len(offers)} offers:")
    for o in offers:
        print(f"  {o.vehicle_name:35s}  {o.vehicle_type:10s}  {o.price_currency} {o.price_total/100:.2f}")

    if offers:
        ensure_debug_search_job(params)
        for o in offers:
            o.search_job_id = DEBUG_JOB_ID
        saved = save_offers(offers)
        print(f"\nSaved {saved} new offers to DB (duplicates skipped)")
    else:
        print("\nNo offers to save")

asyncio.run(main())
