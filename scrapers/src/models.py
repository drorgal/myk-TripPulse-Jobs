from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional
import math

VEHICLE_TYPES = frozenset({"economy", "compact", "midsize", "suv", "van", "luxury"})

VEHICLE_CATEGORY_MAP: dict[str, str] = {
    "mini": "economy",
    "economy": "economy",
    "compact": "compact",
    "midsize": "midsize",
    "intermediate": "midsize",
    "fullsize": "midsize",
    "full-size": "midsize",
    "full size": "midsize",
    "standard": "midsize",
    "suv": "suv",
    "van": "van",
    "minivan": "van",
    "mini van": "van",
    "luxury": "luxury",
    "premium": "luxury",
    "convertible": "luxury",
    "sport": "luxury",
}


def map_vehicle_category(raw: str) -> str:
    return VEHICLE_CATEGORY_MAP.get(raw.lower().strip(), "economy")


def to_cents(amount: float) -> int:
    """Convert a float price to integer cents. Never store money as float."""
    return math.ceil(amount * 100)


@dataclass
class CarSearchParams:
    pickup_location: str
    dropoff_location: str
    pickup_datetime: str   # ISO 8601
    dropoff_datetime: str  # ISO 8601
    currency: str = "USD"
    driver_age: int = 30
    scrapers: Optional[list[str]] = None


@dataclass
class CarOffer:
    search_job_id: str
    provider_name: str
    provider_offer_id: str
    vehicle_type: str        # economy | compact | midsize | suv | van | luxury
    vehicle_name: str
    vehicle_class: str       # SIPP code e.g. "ECMR"
    price_total: int         # CENTS — 4500 = €45.00, never float
    price_currency: str      # ISO 4217
    price_per_day: int       # CENTS
    pickup_location: str
    dropoff_location: str
    pickup_datetime: str     # ISO 8601
    dropoff_datetime: str    # ISO 8601
    rental_days: int
    has_ac: bool = True
    is_automatic: bool = True
    seats_count: Optional[int] = None
    bag_count: Optional[int] = None
    booking_url: Optional[str] = None

    def __post_init__(self) -> None:
        if self.vehicle_type not in VEHICLE_TYPES:
            self.vehicle_type = "economy"
        if self.price_total <= 0:
            raise ValueError(f"price_total must be positive, got {self.price_total}")
        if self.price_per_day <= 0:
            raise ValueError(f"price_per_day must be positive, got {self.price_per_day}")
        if len(self.price_currency) != 3:
            raise ValueError(f"price_currency must be 3 chars, got '{self.price_currency}'")
