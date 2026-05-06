import type { CarSearchParams } from '../models/search-params';

// Payload stored in Redis for a car search job.
// Keep this minimal — it is serialized to JSON and stored in Redis.
// Never put large objects here; store big data in PostgreSQL and reference by ID.
export interface CarSearchJobPayload {
  searchJobId: string;
  params: CarSearchParams;
  requestedAt: string; // ISO timestamp — for SLA tracking and debugging
}
