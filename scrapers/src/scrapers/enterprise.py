"""
Enterprise scraper — skeleton ready for implementation.

Enterprise Holdings operates Enterprise, National, and Alamo.
enterprise.com has a relatively clean booking flow backed by a REST JSON API.

Strategy: intercept XHR requests during vehicle search to capture the
internal vehicle availability response.

TODO:
  1. Navigate enterprise.com/car-rental/deeplinking/... with search params as URL params
     (Enterprise supports deep-link URLs — easier than filling the form)
  2. Intercept network responses matching /res/reservation/.../vehicles
  3. Parse vehicle list and map to CarOffer
  4. Also covers National (nationalcar.com) and Alamo (alamo.com) — same backend

Deep-link URL format (example):
  https://www.enterprise.com/en/car-rental/deeplinking/index.html
    ?from=<pickupLocation>&to=<dropoffLocation>&fromDate=<MM/DD/YYYY>&...

Useful DevTools Network filter: "vehicles" or "availability"
"""

from scrapers.base import BaseScraper
from models import CarOffer, CarSearchParams
from logger import get_logger

log = get_logger("enterprise-scraper")


class EnterpriseScraper(BaseScraper):
    name = "enterprise"
    version = "0.1"

    async def search(self, params: CarSearchParams) -> list[CarOffer]:
        log.info("enterprise_not_implemented", pickup=params.pickup_location)
        # TODO: implement Playwright scraper
        # See module docstring for implementation guide.
        return []
