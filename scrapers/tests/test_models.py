import sys
sys.path.insert(0, "src")

import pytest
from models import CarOffer, map_vehicle_category, to_cents


def test_to_cents():
    assert to_cents(45.00) == 4500
    assert to_cents(45.995) == 4600  # ceil
    assert to_cents(0.01) == 1


def test_map_vehicle_category():
    assert map_vehicle_category("Economy") == "economy"
    assert map_vehicle_category("COMPACT") == "compact"
    assert map_vehicle_category("Intermediate") == "midsize"
    assert map_vehicle_category("Premium") == "luxury"
    assert map_vehicle_category("unknown_type") == "economy"


def test_car_offer_valid():
    offer = CarOffer(
        search_job_id="job1",
        provider_name="hertz",
        provider_offer_id="abc123",
        vehicle_type="economy",
        vehicle_name="Toyota Yaris",
        vehicle_class="ECMR",
        price_total=31500,
        price_currency="EUR",
        price_per_day=4500,
        pickup_location="Rome FCO",
        dropoff_location="Rome FCO",
        pickup_datetime="2026-07-01T10:00:00Z",
        dropoff_datetime="2026-07-08T10:00:00Z",
        rental_days=7,
    )
    assert offer.price_total == 31500
    assert offer.vehicle_type == "economy"


def test_car_offer_unknown_vehicle_type_normalised():
    offer = CarOffer(
        search_job_id="job1",
        provider_name="hertz",
        provider_offer_id="x1",
        vehicle_type="spaceship",  # invalid — should normalise to economy
        vehicle_name="X",
        vehicle_class="",
        price_total=1000,
        price_currency="USD",
        price_per_day=100,
        pickup_location="A",
        dropoff_location="A",
        pickup_datetime="2026-07-01T10:00:00Z",
        dropoff_datetime="2026-07-08T10:00:00Z",
        rental_days=1,
    )
    assert offer.vehicle_type == "economy"


def test_car_offer_invalid_price():
    with pytest.raises(ValueError, match="price_total"):
        CarOffer(
            search_job_id="j",
            provider_name="hertz",
            provider_offer_id="x",
            vehicle_type="economy",
            vehicle_name="X",
            vehicle_class="",
            price_total=0,
            price_currency="USD",
            price_per_day=100,
            pickup_location="A",
            dropoff_location="A",
            pickup_datetime="2026-07-01T10:00:00Z",
            dropoff_datetime="2026-07-08T10:00:00Z",
            rental_days=1,
        )
