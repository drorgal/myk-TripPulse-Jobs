"""
TripPulse Scraper Worker — entry point.

Connects to Redis, polls the car-scrape BullMQ queue, and dispatches
each job to the appropriate Playwright scraper (Hertz, Sixt, Enterprise…).
Results are written directly to PostgreSQL using the same schema as the
Node.js worker.
"""

import asyncio
import os

from dotenv import load_dotenv

load_dotenv()

from logger import get_logger, setup_logging
from worker import run_worker
from db import init_pool, save_offers
from models import CarSearchParams
from scrapers.registry import get_scrapers, get_registered_names

setup_logging()
log = get_logger("main")


async def handle_job(
    search_job_id: str,
    params: CarSearchParams,
    scraper_names: list[str] | None,
) -> None:
    scrapers = get_scrapers(scraper_names)
    log.info(
        "dispatching_to_scrapers",
        search_job_id=search_job_id,
        scrapers=[s.name for s in scrapers],
    )

    # Run all scrapers concurrently — if one fails the others still complete.
    results = await asyncio.gather(
        *[s.search(params) for s in scrapers],
        return_exceptions=True,
    )

    total_saved = 0
    for scraper, result in zip(scrapers, results):
        if isinstance(result, Exception):
            log.warning(
                "scraper_failed",
                scraper=scraper.name,
                search_job_id=search_job_id,
                error=str(result),
            )
            continue

        # Attach the correct searchJobId before saving
        for offer in result:
            offer.search_job_id = search_job_id

        saved = save_offers(result)
        total_saved += saved
        log.info(
            "scraper_done",
            scraper=scraper.name,
            search_job_id=search_job_id,
            offers_found=len(result),
            offers_saved=saved,
        )

    log.info(
        "job_handled",
        search_job_id=search_job_id,
        total_saved=total_saved,
    )


def main() -> None:
    init_pool()
    log.info(
        "scraper_worker_starting",
        registered_scrapers=get_registered_names(),
        enabled=os.environ.get("ENABLED_SCRAPERS", "all"),
    )
    run_worker(handle_job)


if __name__ == "__main__":
    main()
