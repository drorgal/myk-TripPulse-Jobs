import type { CarSearchParams } from '../models/search-params';

// Payload stored in Redis for a car search job.
// Keep this minimal — it is serialized to JSON and stored in Redis.
// Never put large objects here; store big data in PostgreSQL and reference by ID.
export interface CarSearchJobPayload {
  searchJobId: string;
  params: CarSearchParams;
  requestedAt: string; // ISO timestamp — for SLA tracking and debugging
}

// Payload for the Python scraper queue (car-scrape).
// Python workers consume this and run Playwright against real car rental sites.
export interface CarScrapeJobPayload {
  searchJobId: string;
  params: CarSearchParams;
  // Override which scrapers run. Omit to run all registered scrapers.
  scrapers?: string[];
  requestedAt: string;
}
