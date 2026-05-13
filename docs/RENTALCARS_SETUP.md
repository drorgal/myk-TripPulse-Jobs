# RentalCars Provider — Setup Guide

This document explains how to get API credentials and connect a real car rental data source.

---

## How the provider works

When `RENTALCARS_API_KEY` and `RENTALCARS_API_URL` are set, the worker automatically
registers the `rentalcars` provider alongside `mock`. Both run in parallel — the job
fan-out (`Promise.allSettled`) collects results from all providers and saves them to the DB.

If the env vars are **not set**, the provider is silently skipped and only `mock` runs.
No code change needed.

---

## Option 1 — RapidAPI (Easiest, free for development)

**Best for**: getting started quickly, testing the integration, prototyping.

### Steps

1. Go to [rapidapi.com](https://rapidapi.com) and create a free account.
2. Search for **"Booking.com"** or **"Car Rental"** APIs. Good options:
   - **Booking.com API** (by apidojo) — includes car rentals
   - **Rentalcars.com Unofficial API** — if available in your region
3. Subscribe to the free tier (usually 500 req/month).
4. Copy your `X-RapidAPI-Key` from the dashboard.
5. Find the base URL for the cars/search endpoint in the API docs.

### .env values

```
RENTALCARS_API_KEY=your_rapidapi_key
RENTALCARS_API_URL=https://booking-com.p.rapidapi.com/v1
```

> **Note**: RapidAPI responses have different field names than the placeholder types
> in `rentalcars.provider.ts`. You'll need to update the `RentalCarsVehicle` interface
> and `normalize()` method to match the actual response shape.

---

## Option 2 — CarTrawler (Production-grade, B2B partnership required)

**Best for**: production use with rentalcars.com inventory.

CarTrawler is the B2B platform that powers rentalcars.com, Ryanair, and 100+ travel brands.

### Steps

1. Visit [cartrawler.com](https://www.cartrawler.com) → **Partner with us**.
2. Fill out the partnership form. Approval takes 1–4 weeks.
3. Once approved, you receive:
   - `clientId` (used as API key)
   - `countryCode` (your market)
   - Sandbox and production base URLs
4. Review their XML/JSON API docs (provided after onboarding).

### .env values

```
RENTALCARS_API_KEY=your_client_id
RENTALCARS_API_URL=https://sandbox.cartrawler.com/api/v2
RENTALCARS_AFFILIATE_ID=your_affiliate_id
```

---

## Option 3 — Rentalcars.com Affiliate Program

**Best for**: revenue sharing model (you earn commission per booking).

1. Apply at [rentalcars.com/affiliate](https://www.rentalcars.com/affiliate).
2. Once approved, you get access to their API documentation and credentials.
3. Their API is REST-based with JSON responses.

---

## After getting credentials

1. Copy `.env.example` to `.env` (if you haven't already):
   ```bash
   cp .env.example .env
   ```

2. Fill in your values:
   ```
   RENTALCARS_API_KEY=your_actual_key
   RENTALCARS_API_URL=https://the-actual-base-url/v2
   RENTALCARS_AFFILIATE_ID=optional_affiliate_id
   ```

3. Update `rentalcars.provider.ts` if the response format differs:
   - Edit the `RentalCarsVehicle` interface to match the actual API response fields.
   - Update `buildRequest()` to match the expected request format.
   - Update `normalize()` field mappings accordingly.

4. Restart the worker:
   ```bash
   pnpm dev
   # or in Docker:
   docker compose up -d worker
   ```

5. Create a test job and check that both `mock` and `rentalcars` offers appear:
   ```bash
   curl -X POST http://localhost:3000/jobs/car-search \
     -H "Content-Type: application/json" \
     -d '{
       "pickupLocation": "Rome Fiumicino Airport",
       "dropoffLocation": "Rome Fiumicino Airport",
       "pickupDateTime": "2026-07-01T10:00:00Z",
       "dropoffDateTime": "2026-07-08T10:00:00Z",
       "currency": "EUR"
     }'
   ```
   Then poll `GET /jobs/<jobId>` until COMPLETED, and check `GET /offers/cars?jobId=<jobId>`.
   You should see offers with `providerName: "rentalcars"` alongside `providerName: "mock"`.

---

## Testing only the real provider (skip mock)

Pass `providers` in the request body to override which providers run:

```json
{
  "pickupLocation": "...",
  "providers": ["rentalcars"]
}
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Only mock offers appear | ENV vars not set | Check `RENTALCARS_API_KEY` and `RENTALCARS_API_URL` in `.env` |
| Job goes to PARTIAL status | rentalcars provider failed | Check worker logs: `docker compose logs worker` |
| 401 Unauthorized | Invalid API key | Double-check key, check if it needs `Bearer ` prefix |
| Response field not found | API format differs | Update `RentalCarsVehicle` interface in `rentalcars.provider.ts` |
