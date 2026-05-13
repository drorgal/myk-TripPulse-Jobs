"""
Sixt scraper — skeleton ready for implementation.

Sixt.com uses a React SPA backed by a GraphQL API.
Strategy: intercept POST requests to /graphql and parse vehicle availability responses.

TODO:
  1. Identify the correct GraphQL operation name for vehicle search
     (open DevTools → Network → filter "graphql" while searching on sixt.com)
  2. Map Sixt's vehicle categories to CarOffer.vehicle_type
  3. Map pricing fields (Sixt returns prices per-day and total separately)
  4. Handle CAPTCHA / bot detection (Sixt uses Akamai — may need stealth plugin)

Useful starting point: https://www.sixt.com/car-rental/
"""

from scrapers.base import BaseScraper
from models import CarOffer, CarSearchParams
from logger import get_logger

log = get_logger("sixt-scraper")


class SixtScraper(BaseScraper):
    name = "sixt"
    version = "0.1"

    async def search(self, params: CarSearchParams) -> list[CarOffer]:
        log.info("sixt_not_implemented", pickup=params.pickup_location)
        # TODO: implement Playwright scraper
        # See module docstring for implementation guide.
        return []
