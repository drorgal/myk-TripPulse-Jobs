// Single source of truth for all BullMQ queue names.
// The API enqueues to these names; workers consume from these exact names.
// A typo in either place causes silent failures — centralizing prevents that.
export const QUEUE_NAMES = {
  CAR_SEARCH: 'car-search',
  CAR_SCRAPE: 'car-scrape',
  // HOTEL_SEARCH: 'hotel-search',   // Phase 8
  // FLIGHT_SEARCH: 'flight-search', // Future
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
