from abc import ABC, abstractmethod
from models import CarOffer, CarSearchParams


class BaseScraper(ABC):
    name: str
    version: str = "1.0"

    @abstractmethod
    async def search(self, params: CarSearchParams) -> list[CarOffer]:
        """Scrape car offers for the given search params. Return empty list on no results."""
        ...

    async def ping(self) -> bool:
        """Health check — verify the target site is reachable."""
        return True
