from __future__ import annotations

import os
import psycopg2
import psycopg2.pool
from contextlib import contextmanager
from typing import Generator
from models import CarOffer
from logger import get_logger

log = get_logger("db")

_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def init_pool() -> None:
    global _pool
    dsn = os.environ["DATABASE_URL"]
    _pool = psycopg2.pool.ThreadedConnectionPool(minconn=1, maxconn=5, dsn=dsn)
    log.info("db_pool_ready", minconn=1, maxconn=5)


@contextmanager
def get_conn() -> Generator:
    assert _pool is not None, "Call init_pool() first"
    conn = _pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)


_INSERT_OFFER = """
INSERT INTO "CarOffer" (
    id, "searchJobId", "providerName", "providerOfferId",
    "vehicleType", "vehicleName", "vehicleClass",
    "priceTotal", "priceCurrency", "pricePerDay",
    "pickupLocation", "dropoffLocation",
    "pickupDateTime", "dropoffDateTime",
    "rentalDays", "hasAC", "isAutomatic",
    "seatsCount", "bagCount", "bookingUrl",
    "createdAt"
)
VALUES (
    gen_random_uuid()::text, %(search_job_id)s, %(provider_name)s, %(provider_offer_id)s,
    %(vehicle_type)s, %(vehicle_name)s, %(vehicle_class)s,
    %(price_total)s, %(price_currency)s, %(price_per_day)s,
    %(pickup_location)s, %(dropoff_location)s,
    %(pickup_datetime)s::timestamptz, %(dropoff_datetime)s::timestamptz,
    %(rental_days)s, %(has_ac)s, %(is_automatic)s,
    %(seats_count)s, %(bag_count)s, %(booking_url)s,
    NOW()
)
ON CONFLICT ("searchJobId", "providerName", "providerOfferId") DO NOTHING
"""


def save_offers(offers: list[CarOffer]) -> int:
    """Insert offers idempotently. Returns number of rows actually inserted."""
    if not offers:
        return 0

    with get_conn() as conn:
        cur = conn.cursor()
        inserted = 0
        for offer in offers:
            cur.execute(
                _INSERT_OFFER,
                {
                    "search_job_id": offer.search_job_id,
                    "provider_name": offer.provider_name,
                    "provider_offer_id": offer.provider_offer_id,
                    "vehicle_type": offer.vehicle_type,
                    "vehicle_name": offer.vehicle_name,
                    "vehicle_class": offer.vehicle_class,
                    "price_total": offer.price_total,
                    "price_currency": offer.price_currency,
                    "price_per_day": offer.price_per_day,
                    "pickup_location": offer.pickup_location,
                    "dropoff_location": offer.dropoff_location,
                    "pickup_datetime": offer.pickup_datetime,
                    "dropoff_datetime": offer.dropoff_datetime,
                    "rental_days": offer.rental_days,
                    "has_ac": offer.has_ac,
                    "is_automatic": offer.is_automatic,
                    "seats_count": offer.seats_count,
                    "bag_count": offer.bag_count,
                    "booking_url": offer.booking_url,
                },
            )
            inserted += cur.rowcount
        cur.close()

    return inserted
