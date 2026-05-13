from __future__ import annotations

import os
from scrapers.base import BaseScraper
from scrapers.hertz import HertzScraper
from scrapers.sixt import SixtScraper
from scrapers.enterprise import EnterpriseScraper

_ALL_SCRAPERS: dict[str, BaseScraper] = {
    "hertz": HertzScraper(),
    "sixt": SixtScraper(),
    "enterprise": EnterpriseScraper(),
}


def get_scrapers(names: list[str] | None = None) -> list[BaseScraper]:
    """
    Return scrapers to run.
    - names: explicit override list (from job payload)
    - ENABLED_SCRAPERS env var: comma-separated allow-list (e.g. "hertz,sixt")
    - Default: all registered scrapers
    """
    enabled_env = os.environ.get("ENABLED_SCRAPERS")
    allowed: set[str] | None = None

    if names:
        allowed = set(names)
    elif enabled_env:
        allowed = {s.strip() for s in enabled_env.split(",") if s.strip()}

    if allowed is not None:
        return [s for name, s in _ALL_SCRAPERS.items() if name in allowed]

    return list(_ALL_SCRAPERS.values())


def get_registered_names() -> list[str]:
    return list(_ALL_SCRAPERS.keys())
