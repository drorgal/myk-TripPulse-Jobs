# TripPulse Jobs — System Architecture

## Why This System Exists

A travel app needs fresh, structured data. But external provider APIs (car rentals, hotels, flights) are:
- **Slow** — a single search can take 3–10 seconds
- **Rate-limited** — too many concurrent calls gets you blocked
- **Inconsistent** — each provider has a different response shape

**Solution**: Decouple the request from the result using a job queue. A user asks "find me cars in Rome", a job is created instantly (fast API response), workers call providers in the background, and the app polls for results. The travel app **never** calls external providers directly — it only talks to our local API.

---

## High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         myk-trip-plan (Frontend)                    │
│                     React + Zustand + TypeScript                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP (REST)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    @trippulse/api  (Express)                        │
│                                                                     │
│  POST /jobs/car-search   →  Creates SearchJob in PostgreSQL         │
│  GET  /jobs/:id          →  Returns job status + offer count        │
│  GET  /offers/cars       →  Returns normalized CarOffer[]           │
│  GET  /health            →  Checks DB + Redis connectivity          │
│  GET  /metrics           →  Prometheus metrics                      │
└──────────────┬──────────────────────────────────────────────────────┘
               │ Enqueues job (BullMQ)
               ▼
┌──────────────────────────────┐
│         Redis (BullMQ)       │  ← Job queue + job state
│                              │
│  Queue: car-search           │
│  Queue: hotel-search (later) │
│  Queue: flight-search (later)│
└──────────────┬───────────────┘
               │ Worker polls
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   @trippulse/worker (BullMQ Worker)                 │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ car-search.processor.ts                                     │   │
│  │                                                             │   │
│  │  Promise.allSettled([                                       │   │
│  │    MockCarRentalProvider.search(params),   ← now           │   │
│  │    RentalCarsProvider.search(params),      ← Phase 6       │   │
│  │    EnterpriseProvider.search(params),      ← Phase 7       │   │
│  │  ])                                                         │   │
│  │                                                             │   │
│  │  → normalize each provider's result → CarOffer             │   │
│  │  → save to PostgreSQL (skipDuplicates = idempotent)        │   │
│  │  → update SearchJob status (COMPLETED | PARTIAL | FAILED)  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Reads/Writes
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  PostgreSQL  (@trippulse/db + Prisma)               │
│                                                                     │
│   SearchJob                    CarOffer                            │
│   ──────────                   ────────                            │
│   id (cuid)                    id (cuid)                           │
│   status (PENDING→COMPLETED)   searchJobId → SearchJob             │
│   params (Json)                providerName                        │
│   bullJobId                    providerOfferId                     │
│   providers []                 vehicleType / vehicleName           │
│   errorMessage                 priceTotal (cents, never float)     │
│   createdAt / completedAt      pickupLocation / dropoffLocation    │
│                                pickupDateTime / dropoffDateTime     │
│                                hasAC / isAutomatic / seatsCount    │
│                                rawData (Json) ← for re-processing  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### `@trippulse/shared`
The shared kernel — imported by every other package. Contains:
- **Zod schemas** → TypeScript types via `z.infer<>`. One schema = one type. No duplication.
- **Queue names** — single source of truth. A typo here would cause silent failures.
- **Job payload types** — what goes into the Redis queue.
- **Logger factory** (`createLogger(component)`) — pino-based structured logging.
- **Error classes** — typed error hierarchy.

### `@trippulse/db`
Thin wrapper around Prisma. Exports a singleton `PrismaClient`. All other packages import from here — never instantiate Prisma directly elsewhere.

### `@trippulse/api`
Express REST API. Responsibilities:
1. Validate incoming requests (Zod middleware)
2. Create `SearchJob` record in PostgreSQL
3. Enqueue job in BullMQ (same Redis, different Queue instance — that's fine)
4. Return job ID to caller immediately (HTTP 202 Accepted)
5. Serve results when queried

**Does NOT** process jobs. It only creates and reads them.

### `@trippulse/worker`
BullMQ worker process — runs as a **separate Node.js process**. Responsibilities:
1. Poll BullMQ queue for jobs
2. Fan-out to all registered providers via `Promise.allSettled`
3. Normalize provider results into canonical `CarOffer` shape
4. Save to PostgreSQL
5. Update `SearchJob` status
6. Handle retries (BullMQ manages this automatically)

**Independently scalable** — run 1 API + 10 workers without touching API code.

### Provider Layer
Each provider implements `TravelProvider<TSearchParams, TNormalized>`:
```
providers/
  car-rental/
    interface.ts      CarRentalProvider = TravelProvider<CarSearchParams, CarOffer>
    mock.provider.ts  MockCarRentalProvider — fake data + simulated latency
    registry.ts       getCarRentalProviders(names?) → provider[]
  shared/
    provider.interface.ts   Generic TravelProvider<T, R> contract
```

Adding a new provider = implement the interface + register in `registry.ts`. Zero changes elsewhere.

---

## End-to-End Data Flow

```
1. Frontend sends:
   POST /jobs/car-search
   { pickupLocation: "Rome FCO", dropoffLocation: "Rome FCO",
     pickupDateTime: "2026-07-01T10:00:00Z", dropoffDateTime: "2026-07-08T10:00:00Z" }

2. API (job.service.ts):
   a. prisma.searchJob.create({ status: 'PENDING', params: {...} })
      → id: "clue1abc..."
   b. carSearchQueue.add('car-search', { searchJobId: "clue1abc...", params })
      → BullMQ stores job in Redis
   c. prisma.searchJob.update({ bullJobId: bullJob.id })

3. API responds immediately:
   HTTP 202 { jobId: "clue1abc...", status: "PENDING", statusUrl: "/jobs/clue1abc..." }

4. Worker picks up job from Redis:
   a. prisma.searchJob.update({ status: 'PROCESSING' })
   b. Promise.allSettled([mock.search(params)])
   c. mock returns 2 CarOffer objects (fake data, 200-1000ms simulated delay)
   d. prisma.carOffer.createMany({ data: [...], skipDuplicates: true })
   e. prisma.searchJob.update({ status: 'COMPLETED', completedAt: now() })

5. Frontend polls:
   GET /jobs/clue1abc... → { status: "COMPLETED", offerCount: 2 }

6. Frontend fetches results:
   GET /offers/cars?jobId=clue1abc... → { offers: [...CarOffer], total: 2 }
```

---

## What Is NOT Built Yet (And Why)

| Missing | Reason | Future Phase |
|---------|--------|--------------|
| Real provider integrations | Need API keys + contracts | Phase 6–7 |
| Authentication / API keys | Not needed for a job processor | Phase 9 |
| Webhook notifications | Polling is simpler to start | Phase 9 |
| Hotel / flight domains | Validate architecture with cars first | Phase 8 |
| Kafka | BullMQ handles this scale; add Kafka when fan-out consumers multiply | Phase 10+ |
| Python scrapers | Need a working Node pipeline first | Phase 6+ |
| Rate limiting | Add once real providers are integrated | Phase 6 |
| Caching layer | Add once real data patterns emerge | Phase 7+ |

---

## 8-Phase Roadmap

### Phase 1 — Scaffolding
**Goal**: Everything starts. Docker runs. TypeScript compiles.  
**Build**: pnpm monorepo, 4 packages, Docker Compose, TypeScript project references  
**Learn**: pnpm workspace resolution, Docker health checks, TypeScript `paths` and `references`  
**Milestone**: `pnpm build` succeeds. `docker compose up -d` shows healthy postgres + redis.

### Phase 2 — Database Layer
**Goal**: Prisma schema runs migrations. You can query from Node.  
**Build**: `schema.prisma`, migrations, PrismaClient singleton, seed script  
**Learn**: Prisma migration workflow, relation modeling, JSON column tradeoffs, Prisma Studio  
**Milestone**: `pnpm db:seed` inserts data. Prisma Studio shows rows at `localhost:5555`.

### Phase 3 — Provider Layer
**Goal**: A provider can be called and returns typed `CarOffer` data.  
**Build**: `TravelProvider<T,R>` interface, `MockCarRentalProvider`, provider registry, unit tests  
**Learn**: TypeScript generics for plugin interfaces, the strategy pattern, mock-first TDD  
**Milestone**: `pnpm test` passes. Mock provider returns typed `CarOffer[]` per search.

### Phase 4 — Queue and Worker
**Goal**: A job put in Redis gets processed by a worker.  
**Build**: BullMQ Queue + Worker, `processCarSearch` processor, Bull Board dashboard  
**Learn**: BullMQ job lifecycle, `Promise.allSettled` for fault tolerance, `skipDuplicates` for idempotency  
**Milestone**: Manual `queue.add()` → DB has car offers → Bull Board shows COMPLETED.

### Phase 5 — REST API
**Goal**: HTTP requests create and track jobs.  
**Build**: Express app, 3 routes + middleware, `supertest` tests  
**Learn**: 202 Accepted pattern, Zod type inference, polling vs webhooks, Express error middleware  
**Milestone**: Full `curl` flow works. All HTTP tests pass.

### Phase 6 — Retry Handling and Failure Modes
**Goal**: Failed providers don't crash everything. PARTIAL and FAILED states work correctly.  
**Build**: Simulate failures, verify backoff, PARTIAL status, error logging  
**Learn**: Exponential backoff math, idempotent retry design, structured error logging  
**Milestone**: Simulated failure → PARTIAL → retry → COMPLETED. All failure tests pass.

### Phase 7 — Observability
**Goal**: You can understand what the system is doing without reading code.  
**Build**: Structured pino logging, `GET /health`, Prometheus `/metrics`, OpenTelemetry traces  
**Learn**: Four golden signals, trace spans, structured log query patterns (jq)  
**Milestone**: `GET /health → { db: 'ok', redis: 'ok' }`. Logs queryable by `searchJobId` across processes.

### Phase 8 — Extend to Hotels
**Goal**: Prove the architecture extends cleanly. Add hotel search skeleton.  
**Build**: `HotelSearchParamsSchema`, `HotelOffer`, `MockHotelProvider`, `POST /jobs/hotel-search`  
**Learn**: How a good interface makes extension cheap, when to add a new queue vs reuse  
**Milestone**: Hotel search end-to-end. Zero changes to shared infrastructure.

---

## Future Extensibility

### Adding a new travel domain (hotels, flights, attractions)

1. Add to `@trippulse/shared`:
   - `HotelSearchParamsSchema` (Zod schema + inferred type)
   - `HotelOffer` canonical model
   - `QUEUE_NAMES.HOTEL_SEARCH` constant
   - `HotelSearchJobPayload` type

2. Add to `@trippulse/db`:
   - `HotelOffer` Prisma model
   - Run migration

3. Add to `@trippulse/worker`:
   - `providers/hotel/interface.ts` → `HotelProvider = TravelProvider<HotelSearchParams, HotelOffer>`
   - `providers/hotel/mock.provider.ts`
   - `providers/hotel/registry.ts`
   - `workers/hotel-search.worker.ts`
   - `processors/hotel-search.processor.ts`

4. Add to `@trippulse/api`:
   - `POST /jobs/hotel-search` route
   - `GET /offers/hotels` route

Zero changes to existing car rental code. Zero changes to Docker Compose. Zero changes to shared infrastructure.

### Adding a real provider (replacing mock)

1. Implement `CarRentalProvider` interface in a new file
2. Register it in `registry.ts`
3. Done.

The processor, worker, and API are completely unaware of which providers exist.

### Adding a Python scraper

BullMQ uses standard Redis sorted sets. A Python worker can consume from the same Redis queue using `bullmq` Python bindings or a custom Redis consumer. The Python worker must output `CarOffer`-shaped JSON that matches the PostgreSQL schema.

---

## Key Architectural Tradeoffs

### BullMQ vs Kafka
BullMQ is a **job queue** — tasks run once, retried on failure, results stored temporarily. Kafka is an **event log** — events are replayed, retained forever, consumed by multiple independent consumers.

For this use case (process a search, save results, done), BullMQ is correct. Kafka would be appropriate if 5 different downstream systems needed to react to the same search event (analytics pipeline, notification service, cache warmer, ML feature store, audit log). Add Kafka when BullMQ becomes the bottleneck or when fan-out to multiple consumers is needed.

### JSON `params` column
`SearchJob.params` is `Json`, not a normalized table. This means you cannot do `WHERE params.pickupDate > '2026-01-01'` in SQL. But since you always query by `jobId`, and adding new search parameters doesn't require migrations, this is the right call for an early-stage system.

### Prices in cents (integer)
Never store money as `Float`. `$45.00` becomes `4500`. `$45.00 × 7 days = $315.00` becomes `4500 × 7 = 31500`. Floating point arithmetic produces rounding errors in aggregations. The display layer divides by 100.

### `rawData` column
Stores the raw provider API response alongside normalized data. When normalization logic has a bug (wrong field mapping, missing null check), you can fix the normalizer and re-process `rawData` without re-querying the provider. Essential for debugging in production.

### Two-phase write (DB → Queue)
The `SearchJob` is created in PostgreSQL before being enqueued in Redis. There is a tiny window where the DB write succeeds but the Redis enqueue fails (network blip, Redis restart). The job stays in `PENDING` state forever. Mitigation: a cleanup cron job re-enqueues `SearchJob` records in `PENDING` status older than 60 seconds. The full solution is the transactional outbox pattern, but that's overkill here.

### `skipDuplicates: true` on `createMany`
The `@@unique([searchJobId, providerName, providerOfferId])` constraint + `skipDuplicates` makes offer inserts idempotent. If a worker crashes mid-job and BullMQ retries it, re-inserting the same offers silently succeeds. No duplicates, no errors.

---

## Local Development Commands

```bash
# Start infrastructure
docker compose up -d

# Run DB migrations
pnpm db:migrate

# Open Prisma Studio (visual DB browser)
pnpm db:studio        # → http://localhost:5555

# Open Bull Board (queue dashboard)
# → http://localhost:3001

# Start all services (API + Worker)
pnpm dev

# Run tests
pnpm test

# Build all packages
pnpm build

# Reset DB + Docker volumes
pnpm docker:reset
```

## End-to-End Verification

```bash
# Create a car search job
curl -X POST http://localhost:3000/jobs/car-search \
  -H "Content-Type: application/json" \
  -d '{
    "pickupLocation": "Rome Fiumicino Airport",
    "dropoffLocation": "Rome Fiumicino Airport",
    "pickupDateTime": "2026-07-01T10:00:00Z",
    "dropoffDateTime": "2026-07-08T10:00:00Z",
    "currency": "EUR"
  }'
# Response: { "jobId": "clue1abc...", "status": "PENDING" }

# Poll until COMPLETED
curl http://localhost:3000/jobs/<jobId>
# Response: { "status": "COMPLETED", "offerCount": 2 }

# Get normalized car offers
curl "http://localhost:3000/offers/cars?jobId=<jobId>"
# Response: { "offers": [...], "total": 2 }

# Check system health
curl http://localhost:3000/health
# Response: { "db": "ok", "redis": "ok" }

# View Prometheus metrics
curl http://localhost:3000/metrics
```
